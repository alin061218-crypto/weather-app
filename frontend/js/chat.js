import { F, DESC, WX, state } from 'app/config';
import { $, Q, QA, esc } from 'app/ui';

// ═══════════════════════════════════════════════════════════
//  AI 出行建议
// ═══════════════════════════════════════════════════════════
export function generateReply(question, city, wx, advice) {
  const q = question.toLowerCase().trim();
  if (!city || !wx) return '请先在天气页面搜索一个城市，我才能帮你分析哦。';

  const cur = wx.current_weather;
  const code = cur.weathercode;
  const temp = cur.temperature;
  const wind = cur.windspeed;
  const h = wx.hourly;
  const d = wx.daily;
  const desc = DESC(code);
  const uv = h.uv_index?.[0] || 0;
  const humidity = h.relativehumidity_2m?.[0];
  const precip = h.precipitation_probability?.[0] || 0;

  // Combined intent must precede today's clothing/outdoor branches.
  if (q.includes('明天') && (q.includes('穿') || q.includes('衣服'))) {
    const today = cur.time?.slice(0, 10) || d?.time?.[0];
    const index = d?.time?.findIndex(day => day > today) ?? -1;
    const hi = d?.temperature_2m_max?.[index], lo = d?.temperature_2m_min?.[index], nextCode = d?.weathercode?.[index];
    if (!Number.isFinite(hi) || !Number.isFinite(lo) || !Number.isFinite(nextCode)) return '暂无明天的穿衣预报，请稍后再试。';
    const cloth = advice.getClothing((hi + lo) / 2, nextCode, 0);
    return `${city}明天（${d.time[index]}）${DESC(nextCode)}，${F.ftemp(lo, state.unit)}～${F.ftemp(hi, state.unit)}。\n\n建议：${cloth.text}\n推荐搭配：${cloth.tags.join('、')}\n按明日最低温与温差增减衣物；暂无明日风速。`;
  }

  if (q.includes('出门') || (q.includes('适合') && q.includes('出去'))) {
    if (WX.isFreezing(code)) return `${city}当前${desc}，注意路面结冰，建议减少外出并穿防滑鞋。`;
    if (wx.air?.current?.us_aqi > 100) return `${city}当前空气质量欠佳（US AQI ${wx.air.current.us_aqi}），减少长时间户外活动。`;
    if (WX.isStorm(code)) return `${city}当前有雷暴，绝对不建议出门！温度 ${temp}°C，风速 ${wind} km/h。建议待在室内，远离门窗。`;
    if (WX.isRain(code)) return `${city}正在下雨，温度 ${temp}°C。如果要出门，记得带伞、穿防水鞋。降雨概率 ${precip}%。`;
    if (WX.isSnow(code)) return `${city}正在下雪，温度 ${temp}°C。出门注意防滑保暖。如果风不大雪不重，冬日出行也别有趣味。`;
    if (temp > 35) return `${city}当前高温 ${temp}°C，不太适合长时间外出！紫外线强度 ${uv}。建议避开 11:00–15:00，等傍晚再出门。`;
    if (temp >= 22 && temp <= 30) return `${city}天气很棒！温度 ${temp}°C，${desc}，非常适合出门活动。`;
    if (temp >= 5 && temp < 22) return `${city}温度 ${temp}°C，${desc}。可以出门，建议根据温度适当添衣。`;
    if (temp < 5) return `${city}比较冷，温度 ${temp}°C。出门记得穿暖和，戴好围巾手套。`;
    return `当前${city}温度 ${temp}°C，${desc}，综合来看出门问题不大。`;
  }

  if (q.includes('伞') || q.includes('雨伞') || q.includes('带伞')) {
    if (WX.isFreezing(code)) return `${city}当前${desc}，重点是注意路面结冰，减少外出并穿防滑鞋。`;
    if (WX.isRain(code) || precip > 30) return `${city}当前${desc}，降雨概率 ${precip}%，建议带伞。未来几天最高降雨概率 ${Math.max(...(d.precipitation_probability_max || [0]))}%。`;
    if (WX.isStorm(code)) return `${city}有雷暴，必须带伞！而且最好穿防水鞋和衣服。`;
    return `${city}当前${desc}，降雨概率仅 ${precip}%，不太需要带伞。`;
  }

  if (q.includes('穿') || q.includes('衣服')) {
    const cloth = advice.getClothing(temp, code, wind);
    return `${city}温度 ${temp}°C，${desc}。\n\n建议：${cloth.text}\n推荐搭配：${cloth.tags.join('、')}\n${wind > 20 ? `风较大（${wind} km/h），注意防风。` : ''}${WX.isRain(code) ? '记得带伞！' : ''}`;
  }

  if (q.includes('明天') || q.includes('未来') || q.includes('预报') || q.includes('趋势')) {
    if (!d || !d.time) return '暂无预报数据。';
    let reply = `${city} 未来趋势\n\n`;
    for (let i = 0; i < Math.min(5, d.time.length); i++) {
      const hi = d.temperature_2m_max[i], lo = d.temperature_2m_min[i], dp = d.precipitation_probability_max?.[i] || 0;
      reply += `${F.day(d.time[i])}：${DESC(d.weathercode[i])} ${Math.round(lo)}°~${Math.round(hi)}° ${dp > 0 ? dp + '%' : ''}\n`;
    }
    return reply;
  }

  if (q.includes('运动') || q.includes('跑步') || q.includes('锻炼') || q.includes('健身')) {
    const act = advice.getActivity(temp, code, wind, cur.is_day === 1, wx.air?.current?.us_aqi);
    return `${city}温度 ${temp}°C，${desc}。\n\n${act.text}\n推荐：${act.tags.join('、')}`;
  }

  // 默认回复
  return `当前：${city}\n温度：${temp}°C\n天气：${desc}\n湿度：${humidity}%\n风速：${wind} km/h\n紫外线：${uv}\n降雨概率：${precip}%\n\n可以问我：今天适合出门吗、需要带伞吗、明天怎么穿、未来几天趋势`;
}

export function initChat(advice) {
  const input = $('chat-input');
  const sendBtn = $('chat-send');
  const list = $('chat-list');

  function addMsg(role, text) {
    const div = document.createElement('div');
    div.className = `chat-bubble ${role}`;
    const avatarIcon = role === 'bot'
      ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5"/></svg>'
      : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>';
    div.innerHTML = `<div class="chat-avatar">${avatarIcon}</div><div class="chat-text">${esc(text).replace(/\n/g, '<br>')}</div>`;
    list.appendChild(div);
    list.scrollTop = list.scrollHeight;
  }

  function handleSend() {
    const q = input.value.trim();
    if (!q) return;
    addMsg('user', q);
    const reply = generateReply(q, state.city?.city, state.weather, advice);
    setTimeout(() => addMsg('bot', reply), 300);
    input.value = '';
    try {
      const hist = JSON.parse(localStorage.getItem('wx_chat') || '[]');
      hist.push({ role: 'user', text: q, time: Date.now() }, { role: 'bot', text: reply, time: Date.now() });
      if (hist.length > 40) hist.splice(0, hist.length - 40);
      localStorage.setItem('wx_chat', JSON.stringify(hist));
    } catch {}
  }

  sendBtn.addEventListener('click', handleSend);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') handleSend(); });

  QA('.chat-quick-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const q = btn.dataset.q;
      addMsg('user', q);
      const reply = generateReply(q, state.city?.city, state.weather, advice);
      setTimeout(() => addMsg('bot', reply), 300);
    });
  });

  // 恢复聊天
  try {
    const hist = JSON.parse(localStorage.getItem('wx_chat') || '[]');
    if (hist.length) {
      const firstBot = Q('.chat-bubble.bot', list);
      if (firstBot) firstBot.remove();
      for (const m of hist.slice(-10)) addMsg(m.role, m.text);
    }
  } catch {}
}
