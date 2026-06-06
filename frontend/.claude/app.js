/**
 * 天气预报 App
 * - 通过 ipapi.co 获取用户 IP 对应的城市和经纬度
 * - 通过 Open-Meteo 获取实时天气和逐小时预报
 */

// DOM 元素
const loadingEl = document.getElementById('loading');
const weatherCard = document.getElementById('weather-card');
const errorCard = document.getElementById('error-card');
const errorMsg = document.getElementById('error-msg');
const retryBtn = document.getElementById('retry-btn');

// ===== 天气代码 → 图标映射 =====
function getWeatherIcon(code) {
    if (code === 0) return '☀️';                    // 晴
    if (code <= 3) return '⛅';                     // 少云/多云
    if (code <= 48) return '🌫️';                    // 雾
    if (code <= 55) return '🌧️';                    // 毛毛雨
    if (code <= 65) return '🌧️';                    // 雨
    if (code <= 77) return '❄️';                    // 雪
    if (code <= 82) return '🌧️';                    // 阵雨
    if (code <= 86) return '🌨️';                    // 阵雪
    if (code <= 99) return '⛈️';                    // 雷暴
    return '🌤️';
}

function getWeatherDescription(code) {
    if (code === 0) return '晴天';
    if (code === 1) return '少云';
    if (code === 2) return '多云';
    if (code === 3) return '阴天';
    if (code <= 48) return '雾';
    if (code <= 55) return '毛毛雨';
    if (code <= 57) return '冻毛毛雨';
    if (code <= 65) return '雨';
    if (code <= 67) return '冻雨';
    if (code <= 77) return '雪';
    if (code <= 82) return '阵雨';
    if (code <= 86) return '阵雪';
    if (code === 95) return '雷暴';
    if (code <= 99) return '雷暴冰雹';
    return '未知';
}

// ===== 天气分类 =====
function isRain(code)   { return (code >= 51 && code <= 67) || (code >= 80 && code <= 82); }
function isSnow(code)   { return (code >= 71 && code <= 77) || (code >= 85 && code <= 86); }
function isStorm(code)  { return code >= 95; }
function isFog(code)    { return code >= 45 && code <= 48; }
function isClear(code)  { return code === 0 || code === 1; }

// ===== 穿衣搭配建议 =====
function getClothingAdvice(temp, code, windSpeed) {
    let main = '';
    const tags = [];

    // 温度分层
    if (temp >= 35) {
        main = '天气炎热，穿轻薄透气的短袖短裤';
        tags.push('短袖👕', '短裤🩳', '遮阳帽🧢', '墨镜🕶️');
    } else if (temp >= 28) {
        main = '天气较热，建议穿短袖配短裤或薄长裤';
        tags.push('短袖👕', '短裤🩳', '遮阳帽🧢');
    } else if (temp >= 22) {
        main = '气温舒适，T恤或衬衫配长裤即可';
        tags.push('T恤👕', '衬衫👔', '长裤👖');
    } else if (temp >= 16) {
        main = '稍凉，建议长袖或薄卫衣，可备一件薄外套';
        tags.push('长袖🧥', '卫衣', '薄外套', '长裤👖');
    } else if (temp >= 10) {
        main = '偏凉，穿卫衣加夹克或风衣';
        tags.push('卫衣', '夹克🧥', '风衣', '长裤👖');
    } else if (temp >= 5) {
        main = '有点冷，毛衣配外套，注意保暖';
        tags.push('毛衣', '厚外套🧥', '围巾可选');
    } else if (temp >= 0) {
        main = '寒冷，穿厚外套或棉服，搭配毛衣和围巾';
        tags.push('棉服🧥', '毛衣', '围巾🧣', '手套🧤');
    } else if (temp >= -10) {
        main = '非常冷，羽绒服 + 毛衣 + 围巾手套全副武装';
        tags.push('羽绒服🧥', '毛衣', '围巾🧣', '手套🧤', '帽子🎩');
    } else {
        main = '极寒天气，最强保暖装备，尽量减少外出';
        tags.push('厚羽绒服🧥', '多层保暖', '围巾🧣', '手套🧤', '雪地靴👢');
    }

    // 特殊天气叠加
    if (isRain(code)) {
        tags.push('雨伞☂️');
        if (temp > 20) tags.push('防水凉鞋👡');
        else tags.push('防水鞋👟');
    }
    if (isSnow(code)) {
        tags.push('防滑靴👢', '厚袜子🧦');
    }
    if (isFog(code)) {
        tags.push('亮色外套🟡');
    }
    if (windSpeed > 25) {
        tags.push('防风外套💨', '围巾🧣');
    }
    if (isStorm(code)) {
        main = '雷暴天气，尽量避免外出！如需出门注意防雷防雨';
        tags.push('雨伞☂️', '雨衣', '防水鞋👢');
    }

    // 去重
    return { main, tags: [...new Set(tags)] };
}

// ===== 活动建议 =====
function getActivityAdvice(temp, code, windSpeed) {
    let main = '';
    const tags = [];
    const isGoodOutdoor = temp >= 10 && temp <= 32 && !isRain(code) && !isSnow(code) && !isStorm(code) && !isFog(code) && windSpeed < 25;

    if (isStorm(code)) {
        main = '⛈️ 雷暴天气，请留在室内，注意安全！';
        tags.push('居家阅读📚', '看电影🎬', '室内健身🏋️', '桌游🎲', '烹饪🍳');
    } else if (isRain(code)) {
        main = '🌧️ 下雨天，适合室内活动';
        tags.push('室内健身🏋️', '瑜伽🧘', '游泳🏊', '攀岩馆🧗', '看电影🎬', '逛商场🛍️');
    } else if (isSnow(code)) {
        main = '❄️ 下雪天，可以玩雪，也要注意保暖';
        tags.push('滑雪⛷️', '堆雪人⛄', '室内健身🏋️', '泡温泉♨️');
    } else if (isFog(code)) {
        main = '🌫️ 雾天能见度低，建议室内活动';
        tags.push('室内健身🏋️', '瑜伽🧘', '阅读📚', '看电影🎬');
    } else if (temp > 35) {
        main = '🔥 高温天气，避免中午户外运动，注意防暑';
        tags.push('游泳🏊', '水上乐园🌊', '室内健身🏋️', '逛商场🛍️', '傍晚散步🚶');
    } else if (temp >= 30) {
        main = '☀️ 天气较热，适宜水上活动和早晚户外运动';
        tags.push('游泳🏊', '骑行🚴', '晨跑🏃', '公园散步🚶', '户外瑜伽🧘');
    } else if (temp >= 22 && isGoodOutdoor) {
        main = '✅ 天气完美，几乎所有户外运动都适合！';
        tags.push('跑步🏃', '骑行🚴', '徒步🥾', '篮球🏀', '足球⚽', '羽毛球🏸', '户外瑜伽🧘');
    } else if (temp >= 15 && isGoodOutdoor) {
        main = '👍 天气不错，很适合户外运动';
        tags.push('慢跑🏃', '骑行🚴', '徒步🥾', '公园散步🚶', '户外摄影📷');
    } else if (temp >= 5 && isGoodOutdoor) {
        main = '🧥 偏凉但适合运动，记得热身和保暖';
        tags.push('慢跑🏃', '骑行🚴', '徒步🥾', '户外摄影📷');
    } else if (isGoodOutdoor) {
        main = '🥶 天气较冷，运动前充分热身，注意防寒';
        tags.push('慢跑🏃', '徒步🥾', '室内健身🏋️');
    } else if (windSpeed > 25 && !isRain(code) && !isSnow(code) && !isStorm(code) && temp >= 10) {
        main = '💨 风大但天气还行，可以试试放风筝';
        tags.push('放风筝🪁', '室内健身🏋️', '室内攀岩🧗');
    } else {
        main = '🏠 今天更适合室内活动哦';
        tags.push('室内健身🏋️', '瑜伽🧘', '阅读📚', '看电影🎬', '烹饪🍳');
    }

    return { main, tags };
}

// ===== 渲染建议板块 =====
function renderAdvice(mainId, tagsId, advice) {
    document.getElementById(mainId).textContent = advice.main;
    const tagsContainer = document.getElementById(tagsId);
    tagsContainer.innerHTML = '';
    advice.tags.forEach(tag => {
        const span = document.createElement('span');
        span.className = 'advice-tag';
        span.textContent = tag;
        tagsContainer.appendChild(span);
    });
}

// ===== 显示状态切换 =====
function showLoading() {
    loadingEl.classList.remove('hidden');
    weatherCard.classList.add('hidden');
    errorCard.classList.add('hidden');
}

function showWeather() {
    loadingEl.classList.add('hidden');
    weatherCard.classList.remove('hidden');
    errorCard.classList.add('hidden');
}

function showError(msg) {
    loadingEl.classList.add('hidden');
    weatherCard.classList.add('hidden');
    errorCard.classList.remove('hidden');
    errorMsg.textContent = msg;
}

// ===== 获取用户位置（IP → 城市 + 经纬度） =====
async function fetchLocation() {
    const response = await fetch('https://ipapi.co/json/');
    if (!response.ok) {
        throw new Error('无法获取你的位置信息');
    }
    const data = await response.json();
    return {
        city: data.city,
        region: data.region,
        country: data.country_name,
        latitude: data.latitude,
        longitude: data.longitude,
    };
}

// ===== 获取天气（经纬度 → 天气数据） =====
async function fetchWeather(lat, lon) {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true&hourly=temperature_2m,weathercode,relativehumidity_2m,cloudcover&timezone=auto&forecast_hours=6`;
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error('无法获取天气数据');
    }
    return response.json();
}

// ===== 渲染天气卡片 =====
function renderWeather(location, weather) {
    const current = weather.current_weather;
    const hourly = weather.hourly;

    // 城市 & 地区
    document.getElementById('city').textContent = location.city || '未知城市';
    document.getElementById('region').textContent =
        [location.region, location.country].filter(Boolean).join('，') || '未知地区';

    // 天气图标 & 描述
    const code = current.weathercode;
    document.getElementById('weather-icon').textContent = getWeatherIcon(code);
    document.getElementById('weather-desc').textContent = getWeatherDescription(code);

    // 温度
    document.getElementById('temperature').textContent = Math.round(current.temperature);

    // 湿度
    document.getElementById('humidity').textContent =
        weather.hourly.relativehumidity_2m
            ? weather.hourly.relativehumidity_2m[0] + '%'
            : '--';

    // 风速
    document.getElementById('wind-speed').textContent = current.windspeed + ' km/h';

    // 能见度（Open-Meteo 免费版可能不提供，设置默认值）
    document.getElementById('visibility').textContent = '--';

    // 云量
    document.getElementById('cloudiness').textContent =
        weather.hourly.cloudcover ? weather.hourly.cloudcover[0] + '%' : '--';

    // 逐小时预报
    renderHourly(hourly);

    // 穿衣搭配建议
    const clothing = getClothingAdvice(current.temperature, current.weathercode, current.windspeed);
    renderAdvice('clothing-main', 'clothing-tags', clothing);

    // 活动建议
    const activity = getActivityAdvice(current.temperature, current.weathercode, current.windspeed);
    renderAdvice('activity-main', 'activity-tags', activity);

    showWeather();
}

// ===== 渲染逐小时预报 =====
function renderHourly(hourly) {
    const container = document.getElementById('hourly-forecast');
    container.innerHTML = '';

    const times = hourly.time;
    const temps = hourly.temperature_2m;
    const codes = hourly.weathercode;

    for (let i = 0; i < times.length; i++) {
        const timeStr = times[i];
        const hour = timeStr.split('T')[1]?.substring(0, 5) || timeStr;
        const temp = Math.round(temps[i]);
        const icon = getWeatherIcon(codes[i]);

        const item = document.createElement('div');
        item.className = 'hourly-item';
        item.innerHTML = `
            <div class="hour">${hour}</div>
            <div class="icon">${icon}</div>
            <div class="temp">${temp}°</div>
        `;
        container.appendChild(item);
    }
}

// ===== 主流程 =====
async function init() {
    showLoading();

    try {
        // 1. 获取用户位置
        const location = await fetchLocation();

        // 2. 获取天气
        const weather = await fetchWeather(location.latitude, location.longitude);

        // 3. 渲染
        renderWeather(location, weather);
    } catch (err) {
        console.error('获取天气失败:', err);
        showError(err.message || '请检查网络连接后重试');
    }
}

// ===== 重试按钮 =====
retryBtn.addEventListener('click', init);

// ===== 启动 =====
init();
