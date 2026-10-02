// === 天气 App — 核心逻辑（v8 重设计） ===
import { Atmosphere } from './atmosphere.js';
import { icon, weatherIcon } from './icons.js';

const API_BASE = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
  ? 'http://localhost:3001' : '';

const $ = id => document.getElementById(id);
const Q = (sel, el) => (el || document).querySelector(sel);
const QA = (sel, el) => [...(el || document).querySelectorAll(sel)];
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[c]));

const API = {
  ip: 'https://ipapi.co/json/',
  geo: 'https://geocoding-api.open-meteo.com/v1/search',
  wx: 'https://api.open-meteo.com/v1/forecast'
};

const WX_PARAMS = 'current_weather=true&hourly=temperature_2m,weathercode,relativehumidity_2m,cloudcover,apparent_temperature,uv_index,precipitation_probability,pressure_msl,visibility&daily=temperature_2m_max,temperature_2m_min,weathercode,precipitation_probability_max,sunrise,sunset,uv_index_max&timezone=auto&forecast_hours=24&forecast_days=7';

let authToken = localStorage.getItem('wx_token') || '';
let currentUser = null;
let atmosphere = null;
let favoritesCache = null;
let favBusy = false;

let state = {
  city: null,
  weather: null,
  unit: localStorage.getItem('wx_unit') || 'celsius',
  chart: null,
  currentTab: 'home',
  theme: localStorage.getItem('wx_theme') || 'dark',
};
let weatherGeneration = 0;
const CACHE_MAX_AGE = 60 * 60 * 1000;

// ═══════════════════════════════════════════════════════════
//  工具函数
// ═══════════════════════════════════════════════════════════
const F = {
  c2f: c => Math.round(c * 9 / 5 + 32),
  ftemp: (v, u) => u === 'fahrenheit' ? F.c2f(v) + '°F' : Math.round(v) + '°',
  time: s => (s || '').split('T')[1]?.slice(0, 5) || '',
  day: s => {
    const d = new Date(s + 'T12:00:00'), t = new Date();
    t.setHours(12, 0, 0, 0);
    const diff = Math.round((d - t) / 864e5);
    return diff === 0 ? '今天' : diff === 1 ? '明天' : ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.getDay()];
  },
  debounce: (fn, ms = 300) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; },
};

// ═══════════════════════════════════════════════════════════
//  天气代码 → 描述
// ═══════════════════════════════════════════════════════════
const DESC = c => {
  if (c === 0) return '晴';
  if (c === 1) return '少云';
  if (c <= 3) return '多云';
  if (c <= 48) return '雾';
  if (c <= 57) return '毛毛雨';
  if (c <= 67) return '雨';
  if (c <= 77) return '雪';
  if (c <= 82) return '阵雨';
  if (c <= 86) return '阵雪';
  if (c <= 99) return '雷暴';
  return '未知';
};

const WX = {
  isRain: c => (c >= 51 && c <= 67) || (c >= 80 && c <= 82),
  isSnow: c => (c >= 71 && c <= 77) || (c >= 85 && c <= 86),
  isStorm: c => c >= 95,
  isFog: c => c >= 45 && c <= 48,
  isClear: c => c <= 1,
};

// ═══════════════════════════════════════════════════════════
//  API 请求
// ═══════════════════════════════════════════════════════════
async function fetchJSON(url, timeout = 5000, opts = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  const headers = { ...(opts.headers || {}) };
  if (authToken) headers.Authorization = `Bearer ${authToken}`;
  if (opts.method) headers['Content-Type'] = 'application/json';
  try {
    let r;
    try {
      r = await fetch(url, { signal: ctrl.signal, headers, method: opts.method, body: opts.body });
    } catch (e) {
      return { error: e.name === 'AbortError' ? '网络失败：请求超时' : `网络失败：${e.message || '无法连接'}`, kind: 'network' };
    }
    let data;
    try {
      data = await r.json();
    } catch (e) {
      if (!r.ok) return { error: `HTTP ${r.status}：${r.statusText || '请求失败'}`, kind: 'http', status: r.status };
      return { error: `解析失败：${e.message || '响应不是有效 JSON'}`, kind: 'parse' };
    }
    if (!r.ok) return { error: `HTTP ${r.status}：${data?.error || data?.message || r.statusText || '请求失败'}`, kind: 'http', status: r.status };
    return data;
  } finally { clearTimeout(t); }
}

async function ipLocation() {
  try {
    const d = await fetchJSON(`${API_BASE}/api/location`, 8000);
    if (d && d.city && !d.error) return { city: d.city, region: d.region || '', country: d.country || '', lat: d.lat, lon: d.lon };
  } catch {}
  try {
    const d2 = await fetchJSON(API.ip, 8000);
    if (!d2 || d2.error) return null;
    return { city: d2.city || '', region: d2.region || '', country: d2.country_name || '', lat: d2.latitude, lon: d2.longitude };
  } catch { return null; }
}

async function geoSearch(q) {
  const d = await fetchJSON(`${API_BASE}/api/search?q=${encodeURIComponent(q)}`, 4000);
  if (d && Array.isArray(d)) return d.map(r => ({ name: r.name || '', admin1: r.admin1 || '', country: r.country || '', lat: r.lat, lon: r.lon }));
  const d2 = await fetchJSON(`${API.geo}?name=${encodeURIComponent(q)}&count=5&language=zh&format=json`, 4000);
  if (d2?.error) throw new Error(d2.error);
  return d2?.results?.map(r => ({ name: r.name || '', admin1: r.admin1 || '', country: r.country || '', lat: r.latitude, lon: r.longitude })) || [];
}

async function getWeather(lat, lon) {
  const d = await fetchJSON(`${API_BASE}/api/weather?lat=${lat}&lon=${lon}`, 10000);
  if (d && !d.error) return d;
  const d2 = await fetchJSON(`${API.wx}?latitude=${lat}&longitude=${lon}&${WX_PARAMS}`, 10000);
  if (!d2 || d2.error) throw new Error(d2?.error || d?.error || '天气数据获取失败');
  return d2;
}

// ═══════════════════════════════════════════════════════════
//  本地城市数据库
// ═══════════════════════════════════════════════════════════
let cityCache = null;
let cityLoad = null;
const COUNTY = Object.create(null);

async function loadCities() {
  if (cityCache) return cityCache;
  if (!cityLoad) {
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 5000);
    cityLoad = fetch('/data/cities.json', { signal: ctrl.signal })
      .then(response => {
        if (!response.ok) throw new Error('城市库加载失败：HTTP ' + response.status);
        return response.json();
      })
      .then(rows => {
        if (!Array.isArray(rows)) throw new Error('城市库格式错误');
        cityCache = rows;
        for (const city of rows) if (city.parent) COUNTY[city.name] = city.parent;
        return rows;
      })
      .finally(() => clearTimeout(timeout))
      .catch(error => { cityLoad = null; throw error; });
  }
  return cityLoad;
}

// ═══════════════════════════════════════════════════════════
//  城市美食/旅游数据（复用原有 CITY_GUIDE）
// ═══════════════════════════════════════════════════════════
const CITY_GUIDE = {
'北京':{food:'北京烤鸭,炸酱面,铜锅涮肉,驴打滚,炒肝,豆汁焦圈',travel:'故宫,天安门,长城,颐和园,天坛,南锣鼓巷'},
'上海':{food:'小笼包,生煎包,葱油拌面,蟹粉豆腐,排骨年糕,蝴蝶酥',travel:'外滩,东方明珠,豫园,南京路,迪士尼,武康路'},
'广州':{food:'早茶点心,白切鸡,煲仔饭,云吞面,叉烧,艇仔粥',travel:'广州塔,沙面,陈家祠,长隆,白云山,永庆坊'},
'深圳':{food:'光明乳鸽,沙井蚝,潮汕牛肉火锅,隆江猪脚饭,虾饺',travel:'世界之窗,欢乐谷,大小梅沙,仙湖植物园,梧桐山'},
'杭州':{food:'西湖醋鱼,东坡肉,龙井虾仁,片兒川,葱包烩,定胜糕',travel:'西湖,灵隐寺,雷峰塔,西溪湿地,宋城,断桥残雪'},
'成都':{food:'火锅,串串香,麻婆豆腐,夫妻肺片,龙抄手,兔头',travel:'宽窄巷子,锦里,大熊猫基地,都江堰,青城山,春熙路'},
'重庆':{food:'火锅,重庆小面,酸辣粉,毛血旺,辣子鸡,烤鱼',travel:'洪崖洞,磁器口,长江索道,解放碑,武隆天坑,南山'},
'西安':{food:'肉夹馍,羊肉泡馍,凉皮,biangbiang面,葫芦头,甑糕',travel:'兵马俑,大雁塔,城墙,回民街,钟鼓楼,华清池'},
'南京':{food:'鸭血粉丝汤,盐水鸭,皮肚面,鸡汁汤包,糖芋苗,梅花糕',travel:'中山陵,夫子庙,秦淮河,总统府,鸡鸣寺,玄武湖'},
'武汉':{food:'热干面,鸭脖,豆皮,面窝,武昌鱼,藕汤',travel:'黄鹤楼,东湖,长江大桥,户部巷,省博物馆,楚河汉街'},
'苏州':{food:'松鼠桂鱼,响油鳝糊,碧螺虾仁,糖粥,蟹壳黄,生煎',travel:'拙政园,虎丘塔,平江路,周庄古镇,寒山寺,太湖'},
'长沙':{food:'臭豆腐,口味虾,剁椒鱼头,糖油粑粑,辣椒炒肉,米粉',travel:'橘子洲,岳麓山,湖南博物院,IFS国金,太平老街'},
'厦门':{food:'沙茶面,海蛎煎,土笋冻,姜母鸭,酱油水海鲜,花生汤',travel:'鼓浪屿,南普陀寺,环岛路,植物园,沙坡尾,集美学村'},
'昆明':{food:'过桥米线,汽锅鸡,菌子火锅,烤饵块,豆花米线,木瓜水',travel:'石林,滇池,翠湖公园,西山,斗南花市,大观楼'},
'青岛':{food:'辣炒蛤蜊,鲅鱼水饺,海鲜锅,青岛啤酒,烤鱿鱼,排骨米饭',travel:'栈桥,八大关,崂山,五四广场,啤酒博物馆,金沙滩'},
'大理':{food:'破酥粑粑,大理砂锅鱼,烤乳扇,凉鸡米线,洱海弓鱼,酸辣鱼',travel:'洱海,苍山,大理古城,喜洲古镇,崇圣寺三塔,双廊'},
'桂林':{food:'桂林米粉,啤酒鱼,荔浦芋扣肉,恭城油茶,马蹄糕,田螺酿',travel:'漓江,象鼻山,阳朔西街,十里画廊,龙脊梯田,遇龙河'},
'哈尔滨':{food:'锅包肉,马迭尔冰棍,铁锅炖,烤冷面,哈尔滨红肠,大列巴',travel:'冰雪大世界,中央大街,索菲亚教堂,太阳岛,松花江'},
'拉萨':{food:'藏面,酥油茶,牦牛肉,青稞酒,糌粑,甜茶',travel:'布达拉宫,大昭寺,八廓街,纳木错,羊卓雍措,哲蚌寺'},
'贵阳':{food:'酸汤鱼,肠旺面,花溪牛肉粉,丝娃娃,豆腐圆子,辣子鸡',travel:'黄果树瀑布,青岩古镇,黔灵山,甲秀楼,天河潭,千户苗寨'},
'兰州':{food:'牛肉面,酿皮,炒面片,黄焖羊肉,甜醅子,灰豆子',travel:'中山桥,白塔山,五泉山,黄河风情线,省博物馆,水墨丹霞'},
'大连':{food:'海鲜焖子,海胆生吃,烤鱼片,铁板鱿鱼,海鲜水饺,炒海肠',travel:'老虎滩,星海广场,棒棰岛,金石滩,发现王国,东港'},
'三亚':{food:'文昌鸡,和乐蟹,清补凉,抱罗粉,椰子饭,海鲜烧烤',travel:'亚龙湾,蜈支洲岛,南山寺,天涯海角,椰子林,鹿回头'},
'香港':{food:'港式点心,烧鹅,菠萝包,丝袜奶茶,云吞面,叉烧饭',travel:'维多利亚港,迪士尼,海洋公园,太平山顶,星光大道'},
'澳门':{food:'葡式蛋挞,猪扒包,水蟹粥,马介休,木糠布丁,杏仁饼',travel:'大三巴,澳门塔,威尼斯人,官也街,渔人码头,路环岛'},
'台北':{food:'牛肉面,夜市小吃,蚵仔煎,珍珠奶茶,卤肉饭,小笼包',travel:'101大楼,故宫博物院,九份,阳明山,士林夜市,中正纪念堂'},
'天津':{food:'狗不理包子,煎饼果子,耳朵眼炸糕,十八街麻花,嘎巴菜,熟梨糕',travel:'天津之眼,意式风情区,五大道,古文化街,盘山,海河'},
'郑州':{food:'烩面,胡辣汤,桶子鸡,红烧黄河大鲤鱼,焖饼,油馍头',travel:'少林寺,嵩山,河南博物院,商城遗址,黄河风景区'},
'济南':{food:'把子肉,油旋,九转大肠,糖醋鲤鱼,甜沫,奶汤蒲菜',travel:'趵突泉,千佛山,大明湖,五龙潭,芙蓉街,解放阁'},
'合肥':{food:'臭鳜鱼,李鸿章大杂烩,三河米饺,肥西老母鸡汤,庄子煎饼',travel:'三河古镇,包公园,省博物馆,逍遥津,大蜀山,滨湖'},
'福州':{food:'佛跳墙,鱼丸,肉燕,鼎边糊,荔枝肉,芋泥',travel:'三坊七巷,鼓山,西湖,森林公园,平潭岛,上下杭'},
'南宁':{food:'老友粉,柠檬鸭,螺蛳粉,卷筒粉,粉饺,酸嘢',travel:'青秀山,南湖,方特,中山路夜市,德天瀑布,扬美古镇'},
'南昌':{food:'南昌拌粉,瓦罐汤,藜蒿炒腊肉,白糖糕,米粉蒸肉',travel:'滕王阁,八一纪念馆,绳金塔,梅岭,瑶湖,海昏侯'},
'洛阳':{food:'洛阳水席,牛肉汤,不翻汤,牡丹燕菜,新安烫面角',travel:'龙门石窟,白马寺,洛阳博物馆,关林庙,老君山,洛邑古城'},
'珠海':{food:'横琴蚝,斗门重壳蟹,白蕉海鲈,官塘茶果,泥煨鸡',travel:'长隆海洋王国,情侣路,外伶仃岛,御温泉,圆明新园'},
'佛山':{food:'顺德鱼生,均安蒸猪,盲公饼,双皮奶,炸牛奶,柱侯鸡',travel:'祖庙,西樵山,清晖园,南风古灶,岭南天地'},
'无锡':{food:'酱排骨,小笼,太湖三白,镜箱豆腐,肉酿面筋,梅花糕',travel:'鼋头渚,灵山大佛,惠山古镇,三国城,南长街,拈花湾'},
'常州':{food:'天目湖砂锅鱼头,大麻糕,加蟹小笼包,银丝面,萝卜干',travel:'中华恐龙园,天目湖,淹城,天宁寺,南山竹海'},
'温州':{food:'灯盏糕,猪脏粉,温州鱼丸,楠溪江香鱼,长人馄饨',travel:'雁荡山,楠溪江,江心屿,洞头岛,五马街'},
'绍兴':{food:'臭豆腐,梅干菜扣肉,黄酒,茴香豆,糟鸡,笋干烧肉',travel:'鲁迅故里,东湖,兰亭,沈园,柯岩,安昌古镇'},
'太原':{food:'刀削面,太原头脑,过油肉,荞面灌肠,羊杂割,鸡蛋醪糟',travel:'晋祠,山西博物院,双塔寺,蒙山大佛,汾河公园'},
'沈阳':{food:'鸡架,老边饺子,锅包肉,白肉血肠,马家烧麦',travel:'沈阳故宫,张氏帅府,北陵,九一八纪念馆,中街,棋盘山'},
'长春':{food:'熏肉大饼,豆腐串,真不同酱肉,冷面,红烧鹿肉',travel:'伪满皇宫,净月潭,长影世纪城,雕塑公园,莲花山'},
'石家庄':{food:'驴肉火烧,熏肉,正定八大碗,金凤扒鸡,饸烙面',travel:'西柏坡,正定古城,赵州桥,抱犊寨,驼梁,隆兴寺'},
};

function getCityGuide(name) {
  if (CITY_GUIDE[name]) return CITY_GUIDE[name];
  const clean = name.replace(/[市州县区]$/, '');
  if (CITY_GUIDE[clean]) return CITY_GUIDE[clean];
  const parent = COUNTY[name];
  if (parent && CITY_GUIDE[parent]) return CITY_GUIDE[parent];
  const trimmed = name.replace(/[市州县区]$/, '');
  if (trimmed !== name && COUNTY[trimmed]) {
    const p = COUNTY[trimmed];
    if (CITY_GUIDE[p]) return CITY_GUIDE[p];
  }
  return null;
}

function findCity(lat, lon) {
  let best = null, bestD = Infinity;
  for (const { name, lat: clat, lon: clon } of cityCache || []) {
    if (!Number.isFinite(clat) || !Number.isFinite(clon)) continue;
    const d = (clat - lat) ** 2 + (clon - lon) ** 2;
    if (d < bestD) { bestD = d; best = name; }
  }
  const raw = bestD < 0.5 ? best : null;
  if (raw && COUNTY[raw]) return COUNTY[raw];
  return raw;
}

async function searchLocal(q) {
  let s = q;
  for (const sf of ['自治县', '自治州', '县级市', '开发区', '新区', '特区', '地区', '街道', '市', '县', '区', '镇', '乡']) {
    if (s.endsWith(sf)) { s = s.slice(0, -sf.length); break; }
  }
  s = s.toLowerCase().trim();
  if (s.length < 2) return [];
  const scored = [];
  for (const city of await loadCities()) {
    const nl = city.name.toLowerCase();
    let sc = 0;
    if (nl === s) sc = 100;
    else if (nl.startsWith(s)) sc = 80;
    else if (s.startsWith(nl)) sc = 75;
    else if (nl.includes(s)) sc = 60;
    else if (s.includes(nl)) sc = 55;
    else if (s.length >= 2 && nl.length >= 2 && nl.slice(0, 2) === s.slice(0, 2)) sc = 40;
    if (sc > 0) scored.push({ ...city, country: '中国', _s: sc });
  }
  scored.sort((a, b) => b._s - a._s);
  return scored.slice(0, 5).map(({ _s, ...c }) => c);
}

async function doSearch(query) {
  const NOT_CITY = /(机场|航空|车站|高铁|服务区|收费站|隧道|大桥|加油|停车|公墓|陵园)/;
  const nameOK = n => n && !NOT_CITY.test(n) && n.length >= 2;
  let local = [];
  try { local = await searchLocal(query); } catch {}
  if (local.length > 0) return local;
  const qs = [query];
  if (!query.endsWith('市') && !query.endsWith('县') && !query.endsWith('区') && query.length <= 4) qs.push(query + '市');
  if (query.endsWith('市') || query.endsWith('县') || query.endsWith('区')) qs.push(query.slice(0, -1));
  const all = [];
  for (const q of qs) {
    const r = await geoSearch(q);
    for (const c of r) {
      if (!nameOK(c.name)) continue;
      let prio = 0;
      if (q.endsWith('市')) prio += 10;
      if (c.country === '中国') prio += 8;
      if (c.name === q) prio += 4;
      c._prio = prio;
      all.push(c);
    }
  }
  const seen = new Set();
  const uniq = [];
  for (const c of all) {
    const k = c.lat.toFixed(3) + ',' + c.lon.toFixed(3);
    if (!seen.has(k)) { seen.add(k); uniq.push(c); }
  }
  uniq.sort((a, b) => b._prio - a._prio);
  return uniq.slice(0, 5).map(({ _prio, ...c }) => c);
}

// ═══════════════════════════════════════════════════════════
//  新的建议函数（去掉 emoji，纯文字+SVG 风格）
// ═══════════════════════════════════════════════════════════
function getClothing(t, code, w) {
  const r = { text: '', tags: [] };
  if (t >= 35) { r.text = '天气炎热，建议轻薄透气的短袖短裤，注意防晒'; r.tags = ['短袖', '短裤', '遮阳帽', '防晒霜']; }
  else if (t >= 28) { r.text = '较热，短袖配短裤或薄长裤最舒适'; r.tags = ['短袖', '薄长裤', '遮阳帽']; }
  else if (t >= 22) { r.text = '体感舒适，T恤衬衫配长裤刚好'; r.tags = ['T恤', '衬衫', '长裤']; }
  else if (t >= 16) { r.text = '稍凉，建议长袖或薄卫衣'; r.tags = ['长袖', '卫衣', '薄外套']; }
  else if (t >= 10) { r.text = '偏凉，卫衣加夹克最合适'; r.tags = ['卫衣', '夹克', '长裤']; }
  else if (t >= 5) { r.text = '有点冷，毛衣配厚外套保暖'; r.tags = ['毛衣', '厚外套']; }
  else if (t >= 0) { r.text = '寒冷天气，厚外套加毛衣围巾'; r.tags = ['棉服', '毛衣', '围巾', '手套']; }
  else if (t >= -10) { r.text = '非常冷，羽绒服全副武装'; r.tags = ['羽绒服', '毛衣', '围巾', '手套']; }
  else { r.text = '极寒天气，最强保暖减少外出'; r.tags = ['厚羽绒服', '多层保暖', '围巾', '手套', '雪地靴']; }
  if (WX.isRain(code)) { r.text += '，记得带伞'; r.tags.push('雨伞'); }
  if (WX.isSnow(code)) { r.tags.push('防滑靴', '厚袜'); }
  if (WX.isStorm(code)) { r.text = '雷暴天气，尽量不要出门'; r.tags.push('雨伞', '雨衣', '远离树木'); }
  if (w > 25) r.tags.push('防风外套');
  r.tags = [...new Set(r.tags)];
  return r;
}

function getActivity(t, code, w, daytime) {
  const r = { text: '', tags: [] };
  if (WX.isStorm(code)) { r.text = '雷暴天气，适合待在室内'; r.tags = ['阅读', '电影', '室内健身', '桌游', '烹饪']; }
  else if (WX.isRain(code)) { r.text = '下雨天，室内活动更合适'; r.tags = ['室内健身', '瑜伽', '游泳', '攀岩', '电影', '逛商场']; }
  else if (WX.isSnow(code)) { r.text = '下雪了，可以玩雪但注意保暖'; r.tags = ['滑雪', '堆雪人', '室内健身', '温泉']; }
  else if (WX.isFog(code)) { r.text = '雾天能见度低，建议室内活动'; r.tags = ['室内健身', '瑜伽', '阅读', '电影']; }
  else if (t > 35) { r.text = '高温天气，避开中午时段外出'; r.tags = ['游泳', '水上乐园', '室内健身', '傍晚散步']; }
  else if (t >= 30) { r.text = '较热，适合水上和早晚运动'; r.tags = ['游泳', '骑行', '晨跑', '公园散步']; }
  else if (t >= 22) { r.text = '天气完美，尽情享受户外运动'; r.tags = ['跑步', '骑行', '徒步', '篮球', '足球', '羽毛球']; }
  else if (t >= 15) { r.text = '不错的天，适合户外运动'; r.tags = ['慢跑', '骑行', '徒步', '摄影']; }
  else if (t >= 5) { r.text = '偏凉，运动前充分热身'; r.tags = ['慢跑', '骑行', '徒步', '摄影']; }
  else { r.text = '较冷，户外运动注意防寒'; r.tags = ['慢跑', '室内健身']; }
  return r;
}

// ═══════════════════════════════════════════════════════════
//  核心渲染
// ═══════════════════════════════════════════════════════════
function toggle(id) {
  ['loading', 'weather-card', 'error-card'].forEach(x => {
    const el = $(x);
    if (el) el.classList.toggle('hidden', el.id !== id);
  });
}

function resolveCity(loc) {
  if (loc.city && loc.city !== '当前位置' && !/^[A-Za-z]/.test(loc.city)) return loc.city;
  const cn = findCity(loc.lat, loc.lon);
  return cn || loc.city || '未知';
}

function toPrefectureCity(name) {
  if (!name) return name;
  let cleaned = name;
  for (const sf of ['市', '县', '区', '镇', '乡', '街道', '自治县', '自治州', '地区', '开发区', '新区', '特区', '县级市']) {
    if (cleaned.endsWith(sf)) { cleaned = cleaned.slice(0, -sf.length); break; }
  }
  if (COUNTY[cleaned]) return COUNTY[cleaned];
  if (COUNTY[name]) return COUNTY[name];
  return name.startsWith('市辖区') ? null : name;
}

function renderWeather(loc, wx) {
  const cur = wx.current_weather;
  const h = wx.hourly;
  const d = wx.daily;
  const name = resolveCity(loc);
  const isDay = cur.is_day === 1;

  // 城市和地区
  $('city').textContent = name;
  $('region').textContent = [loc.region || loc.admin1, loc.country, loc.coordinateSource].filter(Boolean).join('，') || '';

  // 天气图标（SVG 替换 emoji）
  $('weather-icon').innerHTML = weatherIcon(cur.weathercode, isDay);

  // 温度
  $('temperature').textContent = state.unit === 'fahrenheit'
    ? F.c2f(cur.temperature) + '°F'
    : Math.round(cur.temperature) + '°';

  // 描述
  $('weather-desc').textContent = DESC(cur.weathercode);

  // 关键数据横滑（SVG 图标替换 emoji）
  const statsEl = $('stats-scroll');
  if (statsEl) {
    const items = [];
    if (h.apparent_temperature?.[0] != null) items.push([icon.stat.feelsLike(), '体感', F.ftemp(h.apparent_temperature[0], state.unit)]);
    if (h.relativehumidity_2m?.[0] != null) items.push([icon.stat.humidity(), '湿度', h.relativehumidity_2m[0] + '%']);
    items.push([icon.stat.wind(), '风速', cur.windspeed + ' km/h']);
    if (h.uv_index?.[0] != null) {
      const uv = h.uv_index[0];
      const lvl = uv <= 2 ? '低' : uv <= 5 ? '中' : uv <= 7 ? '高' : uv <= 10 ? '很高' : '极高';
      items.push([icon.stat.uv(), '紫外线', uv + ' ' + lvl]);
    }
    if (h.precipitation_probability?.[0] != null) items.push([icon.stat.rainProb(), '降雨', h.precipitation_probability[0] + '%']);
    if (h.pressure_msl?.[0] != null) items.push([icon.stat.pressure(), '气压', Math.round(h.pressure_msl[0]) + ' hPa']);
    if (h.cloudcover?.[0] != null) items.push([icon.stat.cloud(), '云量', h.cloudcover[0] + '%']);
    if (h.visibility?.[0] != null) items.push([icon.stat.visibility(), '能见度', (h.visibility[0] / 1000).toFixed(1) + ' km']);

    statsEl.innerHTML = items.map(([ico, label, value]) =>
      `<div class="stat-chip"><span class="stat-chip-icon">${ico}</span><span class="stat-chip-value">${value}</span><span class="stat-chip-label">${label}</span></div>`
    ).join('');
  }

  // 7天预报 — 纯文字：温度在右侧，清爽无杂
  const dailyList = $('daily-list');
  if (dailyList && d?.time) {
    dailyList.innerHTML = '';
    for (let i = 0; i < d.time.length; i++) {
      const lo = Math.round(d.temperature_2m_min[i]);
      const hi = Math.round(d.temperature_2m_max[i]);
      const precip = d.precipitation_probability_max?.[i] || 0;

      const dayDiv = document.createElement('div');
      dayDiv.className = 'day-row';
      dayDiv.innerHTML = `
        <span class="day-name">${F.day(d.time[i])}</span>
        <span class="day-icon-wrap">${weatherIcon(d.weathercode[i], true)}</span>
        <span class="day-desc-text">${DESC(d.weathercode[i])}</span>
        <span class="day-temps-right">
          <span class="day-temp-hi">${F.ftemp(hi, state.unit)}</span>
          <span class="day-temp-sep">/</span>
          <span class="day-temp-lo">${F.ftemp(lo, state.unit)}</span>
          ${precip > 0 ? `<span class="day-precip"> ${precip}%</span>` : ''}
        </span>
      `;
      dailyList.appendChild(dayDiv);
    }
  }

  // 建议
  const code = cur.weathercode;
  const temp = cur.temperature;
  const wind = cur.windspeed;
  const daytime = isDay;

  renderAdvice('clothing-main', 'clothing-tags', getClothing(temp, code, wind));
  renderAdvice('activity-main', 'activity-tags', getActivity(temp, code, wind, daytime));
  renderCityGuide(name);

  // 3D 背景切换
  if (atmosphere) atmosphere.setWeather(code, daytime);

  toggle('weather-card');

  // 温度趋势图
  if (h.time?.length > 0) {
    if (!state.chart) state.chart = new TempChart($('temp-chart'));
    requestAnimationFrame(() => state.chart.update(h, state.unit));
  }
}

function renderAdvice(mid, tid, adv) {
  const mel = $(mid);
  const tel = $(tid);
  if (mel) mel.textContent = adv.text;
  if (tel) tel.innerHTML = adv.tags.map(t => `<span class="advice-chip">${t}</span>`).join('');
}

// 城市指南（纯文字/圆点装饰，无 emoji）
function renderCityGuide(name) {
  const g = getCityGuide(name);
  const empty = $('guide-empty');
  const content = $('guide-content');
  if (!g) {
    if (empty) empty.classList.remove('hidden');
    if (content) content.classList.add('hidden');
    return;
  }
  if (empty) empty.classList.add('hidden');
  if (content) content.classList.remove('hidden');

  const foodEl = $('food-guide');
  const travelEl = $('travel-guide');

  if (foodEl) foodEl.innerHTML = g.food.split(',').map(f =>
    `<div class="guide-card"><span class="guide-card-marker"></span><span class="guide-card-text">${f.trim()}</span></div>`
  ).join('');

  if (travelEl) travelEl.innerHTML = g.travel.split(',').map(t =>
    `<div class="guide-card"><span class="guide-card-marker"></span><span class="guide-card-text">${t.trim()}</span></div>`
  ).join('');

  // 重置 guide tab
  QA('.guide-tab').forEach(btn => btn.classList.remove('active'));
  const foodTab = Q('.guide-tab[data-guide="food"]');
  if (foodTab) foodTab.classList.add('active');
  if (foodEl) foodEl.classList.remove('hidden');
  if (travelEl) travelEl.classList.add('hidden');
}

// Guide tab 切换事件
document.addEventListener('click', function (e) {
  if (e.target.classList.contains('guide-tab')) {
    QA('.guide-tab').forEach(t => t.classList.remove('active'));
    e.target.classList.add('active');
    const foodEl = $('food-guide');
    const travelEl = $('travel-guide');
    if (foodEl) foodEl.classList.toggle('hidden', e.target.dataset.guide !== 'food');
    if (travelEl) travelEl.classList.toggle('hidden', e.target.dataset.guide !== 'travel');
  }
});

// ═══════════════════════════════════════════════════════════
//  温度趋势图 (Canvas)
// ═══════════════════════════════════════════════════════════
class TempChart {
  constructor(cvs) {
    this.cvs = cvs;
    this.ctx = cvs.getContext('2d');
    this.tip = null;
    this._createTip();
    this._onResize = () => this._draw();
    window.addEventListener('resize', this._onResize);
  }

  update(h, unit) { this.data = h; this.unit = unit; this._draw(); }

  _createTip() {
    this.tip = document.createElement('div');
    this.tip.className = 'chart-tip hidden';
    this.cvs.parentElement.appendChild(this.tip);
    this.cvs.addEventListener('mousemove', e => this._onMove(e));
    this.cvs.addEventListener('mouseleave', () => this.tip.classList.add('hidden'));
  }

  _onMove(e) {
    if (!this.data) return;
    const r = this.cvs.getBoundingClientRect();
    const mx = e.clientX - r.left;
    const t = this.data.time;
    const tmp = this.data.temperature_2m;
    const idx = Math.round((mx - 40) / (r.width - 56) * (tmp.length - 1));
    if (idx < 0 || idx >= tmp.length) { this.tip.classList.add('hidden'); return; }
    this.tip.classList.remove('hidden');
    this.tip.textContent = F.time(t[idx]) + '  ' + F.ftemp(tmp[idx], this.unit);
    this.tip.style.left = (40 + idx / (tmp.length - 1) * (r.width - 56) - this.tip.offsetWidth / 2) + 'px';
    this.tip.style.top = (r.height * 0.1) + 'px';
  }

  _draw() {
    if (!this.data) return;
    const { time, temperature_2m: temps } = this.data;
    const W = this.cvs.clientWidth, H = this.cvs.clientHeight;
    if (W < 10 || H < 10) return;
    const dpr = devicePixelRatio || 1;
    this.cvs.width = W * dpr;
    this.cvs.height = H * dpr;
    const ctx = this.ctx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const pad = { t: 16, r: 16, b: 28, l: 40 };
    const pw = W - pad.l - pad.r;
    const ph = H - pad.t - pad.b;
    if (pw < 0 || ph < 0) return;

    let min = Math.min(...temps) - 2;
    let max = Math.max(...temps) + 2;
    const range = max - min || 5;

    const xf = i => pad.l + (i / (temps.length - 1)) * pw;
    const yf = v => pad.t + ph - ((v - min) / range) * ph;

    // 读 CSS 变量确定主题色
    const cs = getComputedStyle(document.documentElement);
    const isDark = document.documentElement.getAttribute('data-theme') !== 'light';

    // 背景网格
    ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)';
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= 4; i++) {
      const y = pad.t + (ph / 4) * i;
      const val = max - (range / 4) * i;
      ctx.beginPath();
      ctx.moveTo(pad.l, y);
      ctx.lineTo(pad.l + pw, y);
      ctx.stroke();

      ctx.fillStyle = isDark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.35)';
      ctx.font = '10px system-ui, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(F.ftemp(Math.round(val), this.unit), pad.l - 6, y + 4);
    }

    // 时间标签
    const step = Math.max(1, Math.floor(temps.length / 6));
    ctx.textAlign = 'center';
    ctx.fillStyle = isDark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.35)';
    ctx.font = '10px system-ui, sans-serif';
    for (let i = 0; i < temps.length; i += step) {
      ctx.fillText(F.time(time[i]), xf(i), pad.t + ph + 15);
    }

    // 面积填充
    const primaryColor = cs.getPropertyValue('--primary').trim() || '#5b9cf5';
    const grad = ctx.createLinearGradient(0, pad.t, 0, pad.t + ph);
    grad.addColorStop(0, primaryColor);
    grad.addColorStop(1, 'transparent');

    ctx.beginPath();
    ctx.moveTo(xf(0), yf(temps[0]));
    for (let i = 1; i < temps.length; i++) {
      const xc = (xf(i - 1) + xf(i)) / 2;
      ctx.bezierCurveTo(xc, yf(temps[i - 1]), xc, yf(temps[i]), xf(i), yf(temps[i]));
    }
    ctx.lineTo(xf(temps.length - 1), pad.t + ph);
    ctx.lineTo(xf(0), pad.t + ph);
    ctx.closePath();
    ctx.save();
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.restore();

    // 线条
    ctx.beginPath();
    ctx.moveTo(xf(0), yf(temps[0]));
    for (let i = 1; i < temps.length; i++) {
      const xc = (xf(i - 1) + xf(i)) / 2;
      ctx.bezierCurveTo(xc, yf(temps[i - 1]), xc, yf(temps[i]), xf(i), yf(temps[i]));
    }
    ctx.save();
    ctx.globalAlpha = 0.7;
    ctx.strokeStyle = primaryColor;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();

    // 数据点
    ctx.save();
    ctx.globalAlpha = 0.9;
    for (let i = 0; i < temps.length; i++) {
      ctx.beginPath();
      ctx.arc(xf(i), yf(temps[i]), 2.5, 0, Math.PI * 2);
      ctx.fillStyle = primaryColor;
      ctx.fill();
    }
    ctx.restore();
  }
}

// ═══════════════════════════════════════════════════════════
//  Tab 切换
// ═══════════════════════════════════════════════════════════
function switchTab(tab) {
  state.currentTab = tab;
  QA('.tab-page').forEach(p => p.classList.remove('active'));
  QA('.tab-btn').forEach(b => b.classList.remove('active'));
  const page = $(`tab-${tab}`);
  if (page) page.classList.add('active');
  const btn = Q(`.tab-btn[data-tab="${tab}"]`);
  if (btn) btn.classList.add('active');

  if (tab === 'me') refreshMePage();
  if (tab === 'guide' && state.city) renderCityGuide(state.city.city);
  if (tab === 'home' && state.chart) {
    requestAnimationFrame(() => state.chart._draw());
  }
}

QA('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

// ═══════════════════════════════════════════════════════════
//  搜索 & 主流程
// ═══════════════════════════════════════════════════════════
async function init() {
  const generation = ++weatherGeneration;
  let loc = null;
  toggle('loading');
  try { await loadCities(); } catch {}
  if (generation !== weatherGeneration) return;

  // 1. GPS
  if ('geolocation' in navigator) {
    try {
      const pos = await new Promise((res, rej) => {
        navigator.geolocation.getCurrentPosition(res, rej, { timeout: 8000, maximumAge: 300000 });
      });
      const name = findCity(pos.coords.latitude, pos.coords.longitude);
      loc = { city: name || '当前位置', region: '', country: '中国', lat: pos.coords.latitude, lon: pos.coords.longitude };
    } catch {}
  }
  if (generation !== weatherGeneration) return;

  // 2. IP 兜底
  if (!loc) {
    try {
      const d = await fetchJSON(`${API_BASE}/api/location`, 6000);
      if (d && d.city && !d.error && d.country !== 'United States' && d.country !== 'US') {
        const cn = toPrefectureCity(d.city);
        loc = { city: cn || d.city, region: d.region || '', country: d.country || '', lat: d.lat, lon: d.lon };
      }
    } catch {}
    if (generation !== weatherGeneration) return;
    if (!loc) {
      try {
        const d2 = await fetchJSON(API.ip, 6000);
        if (d2 && !d2.error && d2.country_code === 'CN') {
          const cn = toPrefectureCity(d2.city);
          loc = { city: cn || d2.city, region: d2.region || '', country: '中国', lat: d2.latitude, lon: d2.longitude };
        }
      } catch {}
    }
  }
  if (generation !== weatherGeneration) return;

  // 3. 北京兜底
  if (!loc) loc = { city: '北京', region: '', country: '中国', lat: 39.904, lon: 116.407 };

  try {
    const wx = await getWeather(loc.lat, loc.lon);
    if (generation !== weatherGeneration) return;
    state.city = loc;
    state.weather = wx;
    localStorage.setItem('wx_last', JSON.stringify({ loc, wx, ts: Date.now() }));
    renderWeather(loc, wx);
  } catch (e) {
    if (generation !== weatherGeneration) return;
    const raw = localStorage.getItem('wx_last');
    try {
      const c = raw && JSON.parse(raw);
      const age = Date.now() - c?.ts;
      if (c?.loc && c?.wx && Number.isFinite(c.ts) && age >= 0 && age <= CACHE_MAX_AGE) {
        state.city = c.loc;
        state.weather = c.wx;
        renderWeather(c.loc, c.wx);
        $('weather-desc').textContent += ' · 显示缓存数据';
        return;
      }
    } catch {}
    $('error-msg').textContent = e.message;
    toggle('error-card');
  }
}

function initSearch() {
  const inp = $('search-input');
  const clr = $('search-clear');
  const res = $('search-results');
  const recentEl = $('recent-list');
  const rsec = $('recent-section');
  let last = [];
  let searchGeneration = 0;

  function showSearchMessage(message) {
    res.innerHTML = '';
    const li = document.createElement('li');
    li.className = 'search-item';
    li.textContent = message;
    res.appendChild(li);
    res.classList.remove('hidden');
  }

  const search = F.debounce(async (q, generation) => {
    if (generation !== searchGeneration) return;
    if (q.length < 2) { res.classList.add('hidden'); last = []; return; }
    let found;
    try { found = await doSearch(q); }
    catch (e) {
      if (generation !== searchGeneration) return;
      last = [];
      showSearchMessage(e.message || '搜索失败');
      return;
    }
    if (generation !== searchGeneration) return;
    last = found;
    res.innerHTML = '';
    res.classList.remove('hidden');
    if (!last.length) { showSearchMessage('未找到相关城市，请检查名称'); return; }
    for (const c of last) {
      const li = document.createElement('li');
      li.className = 'search-item';
      li.innerHTML = `<span class="si-name">${esc(c.name)}</span><span class="si-meta">${esc([c.admin1, c.country, c.coordinateSource].filter(Boolean).join('，'))}</span>`;
      li.addEventListener('click', () => { searchGeneration++; selectCity(c); res.classList.add('hidden'); });
      res.appendChild(li);
    }
  }, 250);

  inp.addEventListener('input', () => {
    const generation = ++searchGeneration;
    last = [];
    clr.classList.toggle('hidden', !inp.value);
    if (inp.value.trim().length < 2) res.classList.add('hidden');
    search(inp.value.trim(), generation);
  });

  inp.addEventListener('keydown', async e => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const generation = ++searchGeneration;
    const q = inp.value.trim();
    if (!q) return;
    if (last.length) { selectCity(last[0]); res.classList.add('hidden'); }
    else {
      try {
        const r = await doSearch(q);
        if (generation !== searchGeneration) return;
        if (r.length) selectCity(r[0]);
        else showSearchMessage('未找到相关城市，请检查名称');
      } catch (err) {
        if (generation === searchGeneration) showSearchMessage(err.message || '搜索失败');
      }
    }
  });

  clr.addEventListener('click', () => {
    searchGeneration++;
    last = [];
    inp.value = '';
    clr.classList.add('hidden');
    res.classList.add('hidden');
    inp.focus();
  });

  document.addEventListener('click', e => {
    if (!e.target.closest('.search-box')) res.classList.add('hidden');
  });

  function loadRecent() { try { return JSON.parse(localStorage.getItem('wx_recent') || '[]'); } catch { return []; } }
  function renderRecent() {
    const rc = loadRecent();
    if (!rc.length) { rsec.classList.add('hidden'); return; }
    rsec.classList.remove('hidden');
    recentEl.innerHTML = rc.map(c => `<span class="recent-chip">${esc(c.name)}</span>`).join('');
    QA('.recent-chip', recentEl).forEach((el, i) => {
      el.addEventListener('click', () => selectCity(rc[i]));
    });
  }
  $('clear-recent').addEventListener('click', () => {
    localStorage.removeItem('wx_recent');
    renderRecent();
  });
  renderRecent();
}

async function selectCity(c) {
  const generation = ++weatherGeneration;
  const inp = $('search-input');
  inp.value = c.name;
  $('search-clear').classList.remove('hidden');
  const canonical = (cityCache || []).find(city => city.name === c.name && city.admin1 === c.admin1)
    || (cityCache || []).find(city => city.name === c.name);
  if (canonical) c = { ...c, ...canonical };
  const coordinateSource = c.coordinateSource || '';

  try {
    const recent = JSON.parse(localStorage.getItem('wx_recent') || '[]');
    const filtered = recent.filter(x => !(x.name === c.name && x.admin1 === c.admin1));
    filtered.unshift({ name: c.name, admin1: c.admin1, country: c.country, lat: c.lat, lon: c.lon, coordinateSource });
    localStorage.setItem('wx_recent', JSON.stringify(filtered.slice(0, 5)));
  } catch {}

  const loc = { city: c.name, region: c.admin1 || '', country: c.country || '', lat: c.lat, lon: c.lon, coordinateSource };
  try {
    const wx = await getWeather(c.lat, c.lon);
    if (generation !== weatherGeneration) return;
    state.city = loc;
    state.weather = wx;
    renderWeather(loc, wx);
    toggle('weather-card');
    if (authToken) {
      fetchJSON(`${API_BASE}/api/history`, 3000, {
        method: 'POST',
        body: JSON.stringify({ city: c.name, lat: c.lat, lon: c.lon, weather: DESC(wx.current_weather?.weathercode || 0) })
      });
    }
  } catch (e) {
    if (generation !== weatherGeneration) return;
    $('error-msg').textContent = e.message;
    toggle('error-card');
  }
}

// ═══════════════════════════════════════════════════════════
//  用户认证
// ═══════════════════════════════════════════════════════════
function checkAuth() {
  authToken = localStorage.getItem('wx_token') || '';
  if (authToken) {
    fetchJSON(`${API_BASE}/api/me`, 3000).then(d => {
      if (d && d.user) { currentUser = d.user; updateMeUI(); loadMeFavorites(); }
      else if (d?.status === 401) logout();
    });
  }
}

function updateMeUI() {
  if (currentUser) {
    $('me-login-block').classList.add('hidden');
    $('me-logged-block').classList.remove('hidden');
    $('me-username').textContent = currentUser.username;
  } else {
    $('me-login-block').classList.remove('hidden');
    $('me-logged-block').classList.add('hidden');
  }
  updateStarUI();
}

function logout() {
  localStorage.removeItem('wx_token');
  authToken = '';
  currentUser = null;
  favoritesCache = null;
  updateMeUI();
  updateStarUI();
}

function refreshMePage() {
  if (currentUser) { loadMeFavorites(); loadMeHistory(); }
}

// 登录/注册
let authMode = 'login';
$('me-toggle').addEventListener('click', (e) => {
  e.preventDefault();
  authMode = authMode === 'login' ? 'register' : 'login';
  $('me-submit').textContent = authMode === 'login' ? '登 录' : '注 册';
  $('me-msg').textContent = '';
});

$('me-submit').addEventListener('click', async () => {
  const u = $('me-user').value.trim();
  const p = $('me-pass').value.trim();
  if (!u || !p) { $('me-msg').textContent = '请填写用户名和密码'; return; }
  if (p.length < 6) { $('me-msg').textContent = '密码至少 6 位'; return; }
  const url = `${API_BASE}${authMode === 'login' ? '/api/login' : '/api/register'}`;
  const d = await fetchJSON(url, 5000, { method: 'POST', body: JSON.stringify({ username: u, password: p }) });
  if (d && d.token) {
    localStorage.setItem('wx_token', d.token);
    authToken = d.token;
    currentUser = d.user;
    updateMeUI();
    $('me-user').value = '';
    $('me-pass').value = '';
    $('me-msg').textContent = '';
    refreshMePage();
  } else {
    $('me-msg').textContent = (d && d.error) || '操作失败';
  }
});

$('me-logout').addEventListener('click', () => { logout(); });
$('me-clear-hist').addEventListener('click', async () => {
  if (!confirm('确认清空所有搜索历史？')) return;
  await fetchJSON(`${API_BASE}/api/history`, 3000, { method: 'DELETE' });
  loadMeHistory();
});

async function loadMeFavorites() {
  const list = $('me-fav-list');
  if (!currentUser) { favoritesCache = null; list.innerHTML = '<p class="me-empty">请先登录</p>'; return; }
  const user = currentUser;
  const d = await fetchJSON(`${API_BASE}/api/favorites`);
  if (currentUser !== user) return;
  if (!Array.isArray(d)) { list.innerHTML = '<p class="me-empty">加载失败</p>'; return; }
  favoritesCache = d;
  updateStarUI();
  renderMeFavorites(d);
}

function renderMeFavorites(d) {
  const list = $('me-fav-list');
  if (!d.length) { list.innerHTML = '<p class="me-empty">暂无收藏，在天气页搜索城市后点击星标收藏</p>'; return; }
  list.innerHTML = d.map(f => `<div class="fav-item"><div class="fav-item-click" data-lat="${esc(f.lat)}" data-lon="${esc(f.lon)}" data-name="${esc(f.name)}" data-admin1="${esc(f.admin1)}" data-country="${esc(f.country)}"><div class="fav-item-name">${esc(f.name)}</div><div class="fav-item-meta">${esc(f.admin1)} ${esc(f.country)}</div></div><button class="fav-item-del" data-id="${esc(f.id)}">&times;</button></div>`).join('');
  QA('.fav-item-click', list).forEach(el => {
    el.addEventListener('click', () => {
      selectCity({ name: el.dataset.name, admin1: el.dataset.admin1, country: el.dataset.country, lat: parseFloat(el.dataset.lat), lon: parseFloat(el.dataset.lon) });
      switchTab('home');
    });
  });
  QA('.fav-item-del', list).forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const result = await fetchJSON(`${API_BASE}/api/favorites/${btn.dataset.id}`, 3000, { method: 'DELETE' });
      if (result && !result.error && Array.isArray(favoritesCache)) {
        favoritesCache = favoritesCache.filter(f => String(f.id) !== btn.dataset.id);
        renderMeFavorites(favoritesCache);
        updateStarUI();
      }
    });
  });
}

async function loadMeHistory() {
  const list = $('me-hist-list');
  if (!currentUser) { list.innerHTML = '<p class="me-empty">请先登录</p>'; return; }
  const d = await fetchJSON(`${API_BASE}/api/history`);
  if (!d || d.error) { list.innerHTML = '<p class="me-empty">加载失败</p>'; return; }
  if (!d.length) { list.innerHTML = '<p class="me-empty">暂无记录</p>'; return; }
  list.innerHTML = d.map(h => `<div class="fav-item" style="cursor:pointer"><div class="fav-item-click" data-lat="${esc(h.lat)}" data-lon="${esc(h.lon)}" data-name="${esc(h.city)}"><div class="fav-item-name">${esc(h.city)}</div><div class="fav-item-meta">${esc(h.weather)} · ${esc(new Date(h.time).toLocaleString())}</div></div></div>`).join('');
  QA('.fav-item-click', list).forEach(el => {
    el.addEventListener('click', () => {
      selectCity({ name: el.dataset.name, lat: parseFloat(el.dataset.lat), lon: parseFloat(el.dataset.lon) });
      switchTab('home');
    });
  });
}

function favoriteMatchesCity(fav, loc) {
  if (fav.name && loc.city && fav.name === loc.city && (!fav.admin1 || !loc.region || fav.admin1 === loc.region)) return true;
  return Math.abs(fav.lat - loc.lat) < 0.01 && Math.abs(fav.lon - loc.lon) < 0.01;
}

// 收藏星标
async function onFavClick(e) {
  e.stopPropagation();
  if (!currentUser) { switchTab('me'); return; }
  if (favBusy || !state.city) return;
  favBusy = true;
  const btn = $('fav-btn');
  const user = currentUser;
  btn.disabled = true;
  try {
    if (!Array.isArray(favoritesCache)) await loadMeFavorites();
    if (currentUser !== user || !Array.isArray(favoritesCache)) return;
    const loc = state.city;
    const fav = favoritesCache.find(f => favoriteMatchesCity(f, loc));
    const d = fav
      ? await fetchJSON(`${API_BASE}/api/favorites/${fav.id}`, 3000, { method: 'DELETE' })
      : await fetchJSON(`${API_BASE}/api/favorites`, 3000, {
        method: 'POST',
        body: JSON.stringify({ name: loc.city || loc.name, admin1: loc.region || loc.admin1 || '', country: loc.country || '', lat: loc.lat, lon: loc.lon })
      });
    if (currentUser !== user || !d || d.error) return;
    if (fav) favoritesCache = favoritesCache.filter(f => f.id !== fav.id);
    else favoritesCache.unshift(d);
    renderMeFavorites(favoritesCache);
    updateStarUI();
  } finally {
    favBusy = false;
    btn.disabled = false;
  }
}

function addFavButton() {
  const btn = $('fav-btn');
  if (!btn) return;
  btn.removeEventListener('click', onFavClick);
  btn.addEventListener('click', onFavClick);
  updateStarUI();
}

function updateStarUI() {
  const btn = $('fav-btn');
  if (!btn || !state.city) return;
  const active = !!currentUser && Array.isArray(favoritesCache) && favoritesCache.some(f => favoriteMatchesCity(f, state.city));
  btn.classList.toggle('active', active);
}

// 拦截 renderWeather 加收藏按钮
const _origRW = renderWeather;
renderWeather = function (loc, wx) {
  _origRW(loc, wx);
  if (Number.isFinite(loc.lat) && Number.isFinite(loc.lon)) addFavButton();
};

// ═══════════════════════════════════════════════════════════
//  AI 出行建议
// ═══════════════════════════════════════════════════════════
function generateReply(question, city, wx) {
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

  if (q.includes('出门') || (q.includes('适合') && q.includes('出去'))) {
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
    if (WX.isRain(code) || precip > 30) return `${city}当前${desc}，降雨概率 ${precip}%，建议带伞。未来几天最高降雨概率 ${Math.max(...(d.precipitation_probability_max || [0]))}%。`;
    if (WX.isStorm(code)) return `${city}有雷暴，必须带伞！而且最好穿防水鞋和衣服。`;
    return `${city}当前${desc}，降雨概率仅 ${precip}%，不太需要带伞。`;
  }

  if (q.includes('穿') || q.includes('衣服')) {
    const cloth = getClothing(temp, code, wind);
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
    const act = getActivity(temp, code, wind, cur.is_day === 1);
    return `${city}温度 ${temp}°C，${desc}。\n\n${act.text}\n推荐：${act.tags.join('、')}`;
  }

  // 默认回复
  return `当前：${city}\n温度：${temp}°C\n天气：${desc}\n湿度：${humidity}%\n风速：${wind} km/h\n紫外线：${uv}\n降雨概率：${precip}%\n\n可以问我：今天适合出门吗、需要带伞吗、明天怎么穿、未来几天趋势`;
}

function initChat() {
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
    const reply = generateReply(q, state.city?.city, state.weather);
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
      const reply = generateReply(q, state.city?.city, state.weather);
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

// ═══════════════════════════════════════════════════════════
//  天气地图
// ═══════════════════════════════════════════════════════════
function initMap() {
  const modal = $('map-modal');
  const container = $('map-container');
  const btn = $('map-btn');
  const frame = document.createElement('iframe');
  frame.allow = 'geolocation';
  frame.style.cssText = 'width:100%;height:100%;border:none;position:absolute;top:0;left:0';
  frame.src = 'about:blank';
  container.style.position = 'relative';
  container.style.minHeight = '60vh';
  container.appendChild(frame);

  btn.addEventListener('click', () => {
    const lat = state.city?.lat ?? 39.9;
    const lon = state.city?.lon ?? 116.4;
    const url = `https://embed.windy.com/embed.html?type=map&location=coordinates&metricRain=mm&metricTemp=°C&metricWind=km/h&zoom=7&overlay=wind&product=ecmwf&lat=${lat}&lon=${lon}&detailLat=${lat}&detailLon=${lon}&detail=true&message=true`;
    if (frame.getAttribute('src') !== url) frame.src = url;
    modal.classList.remove('hidden');
  });

  $('map-close').addEventListener('click', () => { modal.classList.add('hidden'); });
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.add('hidden'); });
}

// ═══════════════════════════════════════════════════════════
//  浅色/暗黑主题切换
// ═══════════════════════════════════════════════════════════
function initTheme() {
  const btn = $('theme-btn');
  applyTheme(state.theme);
  btn.addEventListener('click', () => {
    state.theme = state.theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('wx_theme', state.theme);
    applyTheme(state.theme);
  });
}

function applyTheme(mode) {
  document.documentElement.setAttribute('data-theme', mode);
  const metaTheme = document.querySelector('meta[name="theme-color"]');
  if (metaTheme) {
    metaTheme.content = mode === 'dark' ? '#080a0c' : '#fdfdfb';
  }
}

// ═══════════════════════════════════════════════════════════
//  单位切换 (°C / °F)
// ═══════════════════════════════════════════════════════════
function initUnit() {
  // 没有单独的按钮了，直接在温度上长按切换（保持简单）
  $('temperature').addEventListener('click', () => {
    state.unit = state.unit === 'celsius' ? 'fahrenheit' : 'celsius';
    localStorage.setItem('wx_unit', state.unit);
    if (state.weather) renderWeather(state.city, state.weather);
  });
  $('temperature').style.cursor = 'pointer';
  $('temperature').title = '点击切换 °C / °F';
}

// ═══════════════════════════════════════════════════════════
//  启动
// ═══════════════════════════════════════════════════════════
$('retry-btn').addEventListener('click', init);

document.addEventListener('DOMContentLoaded', () => {
  // Three.js 3D 大气层
  const atmContainer = $('atmosphere');
  if (atmContainer) {
    atmosphere = new Atmosphere(atmContainer);
  }

  initSearch();
  initTheme();
  initUnit();
  initMap();
  initChat();
  init();
  checkAuth();
  updateMeUI();
});
