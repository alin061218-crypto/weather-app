import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import Database from 'better-sqlite3';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const testSecret = `task011-${crypto.randomBytes(24).toString('hex')}`;
const adminUsername = 'task011_admin';
const adminPassword = `task011-${crypto.randomBytes(16).toString('hex')}`;
let child;
let baseUrl;
let tempDbDir;
let userToken;
let adminToken;
let dbSnapshot;

async function freePort() {
    const probe = net.createServer();
    await new Promise((resolve) => probe.listen(0, '127.0.0.1', resolve));
    const port = probe.address().port;
    await new Promise((resolve) => probe.close(resolve));
    return port;
}

function snapshotDatabase() {
    const file = path.join('E:/weather/data/db', 'weather.db');
    if (!fs.existsSync(file)) return { file, exists: false };
    const stat = fs.statSync(file);
    const database = new Database(file, { readonly: true });
    const tables = ['users', 'favorites', 'history', 'cache', 'feedback'];
    const rows = Object.fromEntries(
        tables.map((table) => [table, database.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n])
    );
    database.close();
    return { file, exists: true, mtimeMs: stat.mtimeMs, size: stat.size, rows };
}

function expectDatabaseUnchanged(before) {
    const after = snapshotDatabase();
    expect(after.exists).toBe(before.exists);
    if (before.exists) {
        expect(after.mtimeMs).toBe(before.mtimeMs);
        expect(after.size).toBe(before.size);
        expect(after.rows).toEqual(before.rows);
    }
}

async function waitForExit(process) {
    if (process.exitCode !== null) return;
    await once(process, 'exit');
}

async function waitForExitWithTimeout(process, timeoutMs) {
    await Promise.race([waitForExit(process), new Promise((resolve) => setTimeout(resolve, timeoutMs))]);
}

beforeAll(async () => {
    dbSnapshot = snapshotDatabase();
    tempDbDir = fs.mkdtempSync(path.join(os.tmpdir(), 'weather-task011-'));
    expect(path.dirname(path.resolve(tempDbDir))).toBe(path.resolve(os.tmpdir()));
    const port = await freePort();
    baseUrl = `http://127.0.0.1:${port}`;
    child = spawn(process.execPath, ['server.js'], {
        cwd: root,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
            ...process.env,
            NODE_ENV: 'test',
            PORT: String(port),
            DB_DIR: tempDbDir,
            JWT_SECRET: testSecret,
            ADMIN_USER: adminUsername,
            ADMIN_PASSWORD_HASH: bcrypt.hashSync(adminPassword, 4)
        }
    });

    let logs = '';
    child.stdout.on('data', (chunk) => {
        logs += chunk;
    });
    child.stderr.on('data', (chunk) => {
        logs += chunk;
    });
    for (let attempt = 0; attempt < 100; attempt += 1) {
        if (child.exitCode !== null) throw new Error(`测试服务提前退出：${logs}`);
        try {
            const response = await request(baseUrl).get('/admin/api/overview');
            if (response.status === 401) return;
        } catch {
            // The listener may not be ready yet.
        }
        await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error(`测试服务启动超时：${logs}`);
}, 15000);

afterAll(async () => {
    if (child?.exitCode === null) {
        child.kill('SIGTERM');
        await waitForExitWithTimeout(child, 6000);
        if (child.exitCode === null) {
            child.kill();
            await waitForExitWithTimeout(child, 2000);
        }
    }
    expect(path.dirname(path.resolve(tempDbDir))).toBe(path.resolve(os.tmpdir()));
    expect(path.basename(tempDbDir)).toMatch(/^weather-task011-/);
    fs.rmSync(tempDbDir, { recursive: true, force: true, maxRetries: 3 });
    expect(fs.existsSync(tempDbDir)).toBe(false);
    expectDatabaseUnchanged(dbSnapshot);
}, 15000);

describe('认证、用户数据与安全回归', () => {
    it('注册和登录返回 JWT，并拒绝过期、篡改、缺失 token', async () => {
        const username = `task011_${Date.now()}`;
        const password = 'correct-password-1';
        const registration = await request(baseUrl).post('/api/register').send({ username, password });
        expect(registration.status).toBe(200);
        expect(registration.body.user.username).toBe(username);
        expect(registration.body.token).toEqual(expect.any(String));
        userToken = registration.body.token;

        const login = await request(baseUrl).post('/api/login').send({ username, password });
        expect(login.status).toBe(200);
        expect(login.body.token).toEqual(expect.any(String));
        userToken = login.body.token;

        const missing = await request(baseUrl).get('/api/me');
        expect(missing.status).toBe(401);
        const tampered = await request(baseUrl).get('/api/me').set('Authorization', `Bearer ${userToken}x`);
        expect(tampered.status).toBe(401);
        const expired = jwt.sign({ id: registration.body.user.id, username }, testSecret, {
            expiresIn: -1,
            issuer: 'weather-app',
            audience: 'weather-frontend'
        });
        const expiredResponse = await request(baseUrl).get('/api/me').set('Authorization', `Bearer ${expired}`);
        expect(expiredResponse.status).toBe(401);
    });

    it('收藏支持增删，并隔离未登录请求', async () => {
        const unauthorized = await request(baseUrl).get('/api/favorites');
        expect(unauthorized.status).toBe(401);
        const created = await request(baseUrl)
            .post('/api/favorites')
            .set('Authorization', `Bearer ${userToken}`)
            .send({ name: '测试城市', admin1: '测试省', country: '中国', lat: 39.9, lon: 116.4 });
        expect(created.status).toBe(200);
        const listed = await request(baseUrl).get('/api/favorites').set('Authorization', `Bearer ${userToken}`);
        expect(listed.status).toBe(200);
        expect(listed.body.some((item) => item.id === created.body.id)).toBe(true);
        const removed = await request(baseUrl)
            .delete(`/api/favorites/${created.body.id}`)
            .set('Authorization', `Bearer ${userToken}`);
        expect(removed.status).toBe(200);
        expect((await request(baseUrl).get('/api/favorites').set('Authorization', `Bearer ${userToken}`)).body).toEqual(
            []
        );
    });

    it('历史记录支持新增和清除', async () => {
        const created = await request(baseUrl)
            .post('/api/history')
            .set('Authorization', `Bearer ${userToken}`)
            .send({ city: '测试城市', lat: 39.9, lon: 116.4, weather: '晴' });
        expect(created.status).toBe(200);
        const listed = await request(baseUrl).get('/api/history').set('Authorization', `Bearer ${userToken}`);
        expect(listed.status).toBe(200);
        expect(listed.body.some((item) => item.city === '测试城市')).toBe(true);
        const removed = await request(baseUrl).delete('/api/history').set('Authorization', `Bearer ${userToken}`);
        expect(removed.status).toBe(200);
        expect((await request(baseUrl).get('/api/history').set('Authorization', `Bearer ${userToken}`)).body).toEqual(
            []
        );
    });

    it('越界经纬度返回 400', async () => {
        const weather = await request(baseUrl).get('/api/weather?lat=91&lon=0');
        expect(weather.status).toBe(400);
        const favorite = await request(baseUrl)
            .post('/api/favorites')
            .set('Authorization', `Bearer ${userToken}`)
            .send({ name: '越界', lat: 0, lon: 181 });
        expect(favorite.status).toBe(400);
    });
});

describe('后台鉴权与 TASK-003 XSS 回归', () => {
    it('无 token 和无效 token 访问 admin API 都是 401', async () => {
        expect((await request(baseUrl).get('/admin/api/overview')).status).toBe(401);
        expect(
            (await request(baseUrl).get('/admin/api/overview').set('Authorization', 'Bearer invalid-token')).status
        ).toBe(401);
    });

    it('admin API 不返回密码字段，admin 页面保持固定安全渲染骨架', async () => {
        const login = await request(baseUrl)
            .post('/api/admin-login')
            .send({ username: adminUsername, password: adminPassword });
        expect(login.status).toBe(200);
        adminToken = login.body.token;

        // Seed an intentionally hostile value directly into the isolated test DB.
        // The API must expose the value as data, while the HTML shell must never
        // interpolate it into markup (the browser later assigns it via textContent).
        const payload = `<img src=x onerror=alert('task011')>`;
        const database = new Database(path.join(tempDbDir, 'weather.db'));
        database
            .prepare('INSERT INTO users (id, username, password, createdAt) VALUES (?, ?, ?, ?)')
            .run(crypto.randomUUID(), payload, 'not-a-real-password', new Date().toISOString());
        database.close();

        const overview = await request(baseUrl).get('/admin/api/overview').set('Authorization', `Bearer ${adminToken}`);
        expect(overview.status).toBe(200);
        expect(overview.body.users.some((user) => user.username === payload)).toBe(true);
        for (const user of overview.body.users) expect(Object.keys(user)).not.toContain('password');
        expect(JSON.stringify(overview.body)).not.toMatch(/"password"/i);
        const stats = await request(baseUrl).get('/admin/api/stats').set('Authorization', `Bearer ${adminToken}`);
        expect(stats.status).toBe(200);
        expect(JSON.stringify(stats.body)).not.toMatch(/"password"/i);

        const page = await request(baseUrl).get('/admin').set('Authorization', `Bearer ${adminToken}`);
        expect(page.status).toBe(200);
        expect(page.text).not.toMatch(/innerHTML\s*=/i);
        expect(page.text).not.toContain(payload);
    });
});
