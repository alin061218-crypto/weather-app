// === 天气 App — 核心逻辑 ===
// IP/GPS定位 → 天气 → 图表 → 建议
// 后端 API 地址（自动适配本地/线上）
const API_BASE = (location.hostname === 'localhost' || location.hostname === '127.0.0.1') ? 'http://localhost:3000' : '';

const $ = id => document.getElementById(id);
const API = { ip: 'https://ipapi.co/json/', geo: 'https://geocoding-api.open-meteo.com/v1/search', wx: 'https://api.open-meteo.com/v1/forecast' };
const WX_PARAMS = 'current_weather=true&hourly=temperature_2m,weathercode,relativehumidity_2m,cloudcover,apparent_temperature,uv_index,precipitation_probability,pressure_msl,visibility&daily=temperature_2m_max,temperature_2m_min,weathercode,precipitation_probability_max,sunrise,sunset,uv_index_max&timezone=auto&forecast_hours=24&forecast_days=7';
let authToken = localStorage.getItem('wx_token') || '';
let currentUser = null;

let state = { city: null, weather: null, unit: localStorage.getItem('wx_unit') || 'celsius', chart: null, particles: null };

// === 工具函数 ===
const F = {
    c2f: c => Math.round(c * 9/5 + 32),
    ftemp: (v, u) => u === 'fahrenheit' ? F.c2f(v) + '°F' : Math.round(v) + '°',
    time: s => (s || '').split('T')[1]?.slice(0, 5) || '',
    day: s => { const d = new Date(s + 'T12:00:00'), t = new Date(); t.setHours(12,0,0,0); const diff = Math.round((d - t)/864e5); return diff === 0 ? '今天' : diff === 1 ? '明天' : ['周日','周一','周二','周三','周四','周五','周六'][d.getDay()]; },
    debounce: (fn, ms = 300) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; },
};

// === 天气图标 ===
// WMO 天气代码映射: https://open-meteo.com/en/docs#weathervariables
const ICON = c => c === 0 ? '☀️' : c <= 3 ? '⛅' : c <= 48 ? '🌫️' : c <= 57 ? '🌧️' : c <= 67 ? '🌧️' : c <= 77 ? '❄️' : c <= 82 ? '🌧️' : c <= 86 ? '🌨️' : '⛈️';
const DESC = c => {
    // 按 WMO 代码精确映射
    if (c === 0) return '晴';
    if (c === 1) return '少云';
    if (c <= 3) return '多云';
    if (c <= 48) return '雾';          // 45, 48 雾/雾凇
    if (c <= 57) return '毛毛雨';      // 51-57 小/中/大毛毛雨+冻毛毛雨
    if (c <= 67) return '雨';          // 61-67 小/中/大雨+冻雨
    if (c <= 77) return '雪';          // 71-77 小/中/大雪+雪粒
    if (c <= 82) return '阵雨';        // 80-82 小/中/大阵雨
    if (c <= 86) return '阵雪';        // 85-86 小/大阵雪
    if (c <= 99) return '雷暴';        // 95 雷暴, 96/99 雷暴+冰雹
    return '未知';
};
const isRain = c => (c >= 51 && c <= 67) || (c >= 80 && c <= 82);   // 毛毛雨/雨/阵雨
const isSnow = c => (c >= 71 && c <= 77) || (c >= 85 && c <= 86);     // 雪/阵雪
const isStorm = c => c >= 95;                                           // 雷暴
const isFog = c => c >= 45 && c <= 48;                                  // 雾
const isClear = c => c <= 1;

// === API 请求 ===
async function fetchJSON(url, timeout = 5000, opts = {}) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeout);
    const headers = { ...(opts.headers || {}) };
    if (authToken) headers.Authorization = `Bearer ${authToken}`;
    const init = { signal: ctrl.signal, headers };
    if (opts.method) init.method = opts.method;
    if (opts.body) { init.body = opts.body; headers['Content-Type'] = 'application/json'; }
    try { const r = await fetch(url, init); return r.ok ? r.json() : null; }
    catch { return null; }
    finally { clearTimeout(t); }
}

async function ipLocation() {
    // 优先用后端代理
    const d = await fetchJSON(`${API_BASE}/api/location`, 4000);
    if (d && !d.error) return { city: d.city || '', region: d.region || '', country: d.country || '', lat: d.lat, lon: d.lon };
    // 兜底直连
    const d2 = await fetchJSON(API.ip, 4000);
    if (!d2 || d2.error) return null;
    return { city: d2.city || '', region: d2.region || '', country: d2.country_name || '', lat: d2.latitude, lon: d2.longitude };
}

async function geoSearch(q) {
    // 优先用后端代理
    const d = await fetchJSON(`${API_BASE}/api/search?q=${encodeURIComponent(q)}`, 4000);
    if (d && Array.isArray(d)) return d.map(r => ({ name: r.name || '', admin1: r.admin1 || '', country: r.country || '', lat: r.lat, lon: r.lon }));
    // 兜底直连
    const d2 = await fetchJSON(`${API.geo}?name=${encodeURIComponent(q)}&count=5&language=zh&format=json`, 4000);
    return d2?.results?.map(r => ({ name: r.name || '', admin1: r.admin1 || '', country: r.country || '', lat: r.latitude, lon: r.longitude })) || [];
}

async function getWeather(lat, lon) {
    // 优先用后端代理
    const d = await fetchJSON(`${API_BASE}/api/weather?lat=${lat}&lon=${lon}`, 8000);
    if (d && !d.error) return d;
    // 兜底直连
    const d2 = await fetchJSON(`${API.wx}?latitude=${lat}&longitude=${lon}&${WX_PARAMS}`, 8000);
    if (!d2) throw new Error('天气数据获取失败');
    return d2;
}

// === 本地城市数据库 (精简版：地级市 + 常用区县) ===
const DB = [
['北京','北京',39.904,116.407],['上海','上海',31.230,121.474],['天津','天津',39.343,117.362],['重庆','重庆',29.432,106.912],
['广州','广东',23.129,113.264],['深圳','广东',22.543,114.058],['杭州','浙江',30.274,120.155],['南京','江苏',32.062,118.778],
['武汉','湖北',30.593,114.306],['成都','四川',30.573,104.067],['西安','陕西',34.342,108.940],['郑州','河南',34.747,113.625],
['济南','山东',36.651,116.997],['青岛','山东',36.067,120.383],['沈阳','辽宁',41.806,123.432],['大连','辽宁',38.914,121.615],
['哈尔滨','黑龙江',45.804,126.535],['长春','吉林',43.817,125.324],['长沙','湖南',28.228,112.939],['福州','福建',26.075,119.297],
['厦门','福建',24.480,118.089],['石家庄','河北',38.043,114.515],['太原','山西',37.871,112.549],['合肥','安徽',31.821,117.227],
['南昌','江西',28.682,115.858],['昆明','云南',25.039,102.718],['贵阳','贵州',26.647,106.630],['南宁','广西',22.817,108.367],
['海口','海南',20.044,110.200],['兰州','甘肃',36.061,103.834],['西宁','青海',36.617,101.779],['银川','宁夏',38.487,106.231],
['呼和浩特','内蒙古',40.843,111.750],['乌鲁木齐','新疆',43.826,87.617],['拉萨','西藏',29.650,91.100],
['苏州','江苏',31.309,120.602],['无锡','江苏',31.491,120.312],['常州','江苏',31.810,119.974],['南通','江苏',31.980,120.894],
['徐州','江苏',34.205,117.285],['扬州','江苏',32.394,119.413],['镇江','江苏',32.190,119.425],['盐城','江苏',33.350,120.164],
['淮安','江苏',33.610,119.015],['泰州','江苏',32.456,119.926],['宿迁','江苏',33.963,118.275],['连云港','江苏',34.597,119.221],
['宁波','浙江',29.868,121.544],['温州','浙江',27.994,120.699],['嘉兴','浙江',30.771,120.756],['湖州','浙江',30.893,120.088],
['绍兴','浙江',30.030,120.580],['金华','浙江',29.078,119.647],['衢州','浙江',28.936,118.874],['舟山','浙江',30.017,122.207],
['台州','浙江',28.656,121.421],['丽水','浙江',28.467,119.923],
['珠海','广东',22.271,113.577],['汕头','广东',23.354,116.682],['佛山','广东',23.022,113.122],['东莞','广东',23.021,113.752],
['中山','广东',22.516,113.393],['惠州','广东',23.112,114.417],['江门','广东',22.579,113.082],['湛江','广东',21.271,110.359],
['肇庆','广东',23.047,112.465],['茂名','广东',21.663,110.925],['梅州','广东',24.289,116.123],['韶关','广东',24.802,113.598],
['清远','广东',23.682,113.057],['揭阳','广东',23.550,116.373],['潮州','广东',23.657,116.622],
['烟台','山东',37.465,121.448],['潍坊','山东',36.707,119.162],['威海','山东',37.513,122.120],['临沂','山东',35.105,118.356],
['淄博','山东',36.814,118.055],['济宁','山东',35.415,116.587],['泰安','山东',36.200,117.080],['日照','山东',35.416,119.527],
['聊城','山东',36.456,115.986],['德州','山东',37.436,116.359],['滨州','山东',37.382,118.017],['菏泽','山东',35.234,115.481],
['枣庄','山东',34.811,117.324],['东营','山东',37.434,118.675],
['洛阳','河南',34.618,112.454],['开封','河南',34.798,114.308],['南阳','河南',32.991,112.529],['新乡','河南',35.303,113.927],
['安阳','河南',36.098,114.393],['许昌','河南',34.036,113.852],['商丘','河南',34.414,115.656],['信阳','河南',32.147,114.093],
['周口','河南',33.626,114.697],['驻马店','河南',33.011,114.022],['平顶山','河南',33.767,113.193],
['唐山','河北',39.631,118.180],['保定','河北',38.874,115.465],['邯郸','河北',36.626,114.539],['廊坊','河北',39.538,116.684],
['沧州','河北',38.305,116.839],['邢台','河北',37.071,114.504],['秦皇岛','河北',39.936,119.600],
['宜昌','湖北',30.691,111.291],['襄阳','湖北',32.009,112.122],['荆州','湖北',30.335,112.241],['黄石','湖北',30.200,115.039],
['十堰','湖北',32.652,110.798],['孝感','湖北',30.925,113.917],['黄冈','湖北',30.454,114.872],
['株洲','湖南',27.828,113.135],['湘潭','湖南',27.830,112.944],['衡阳','湖南',26.893,112.572],['岳阳','湖南',29.357,113.129],
['常德','湖南',29.032,111.699],['郴州','湖南',25.771,113.015],['邵阳','湖南',27.239,111.468],
['绵阳','四川',31.468,104.679],['德阳','四川',31.127,104.398],['宜宾','四川',28.751,104.643],['南充','四川',30.842,106.111],
['泸州','四川',28.872,105.442],['乐山','四川',29.552,103.766],
['鞍山','辽宁',41.109,122.994],['抚顺','辽宁',41.881,123.957],['锦州','辽宁',41.095,121.127],['营口','辽宁',40.667,122.235],
['丹东','辽宁',40.001,124.355],['本溪','辽宁',41.294,123.767],['辽阳','辽宁',41.267,123.174],
['吉林市','吉林',43.838,126.550],['四平','吉林',43.166,124.350],['通化','吉林',41.729,125.940],['延边','吉林',42.891,129.509],
['齐齐哈尔','黑龙江',47.354,123.918],['大庆','黑龙江',46.588,125.103],['牡丹江','黑龙江',44.553,129.632],
['咸阳','陕西',34.330,108.709],['宝鸡','陕西',34.363,107.238],['渭南','陕西',34.500,109.510],['延安','陕西',36.585,109.490],
['汉中','陕西',33.068,107.024],['榆林','陕西',38.286,109.734],
['泉州','福建',24.874,118.676],['漳州','福建',24.513,117.647],['莆田','福建',25.454,119.008],['龙岩','福建',25.075,117.017],
['芜湖','安徽',31.353,118.433],['蚌埠','安徽',32.916,117.389],['安庆','安徽',30.531,117.059],
['九江','江西',29.705,116.002],['赣州','江西',25.832,114.934],['景德镇','江西',29.274,117.178],
['大同','山西',40.076,113.300],['长治','山西',36.195,113.117],['运城','山西',35.016,111.007],['临汾','山西',36.089,111.519],
['遵义','贵州',27.721,106.927],['六盘水','贵州',26.592,104.830],['安顺','贵州',26.253,105.948],['毕节','贵州',27.299,105.305],
['大理','云南',25.592,100.230],['丽江','云南',26.873,100.230],['曲靖','云南',25.489,103.796],
['天水','甘肃',34.581,105.725],['酒泉','甘肃',39.733,98.494],['张掖','甘肃',38.926,100.450],
['桂林','广西',25.274,110.290],['柳州','广西',24.326,109.416],['北海','广西',21.473,109.119],['梧州','广西',23.477,111.279],
['包头','内蒙古',40.658,109.840],['鄂尔多斯','内蒙古',39.609,109.781],['赤峰','内蒙古',42.258,118.889],
['克拉玛依','新疆',45.579,84.889],['喀什','新疆',39.468,75.990],['伊犁','新疆',43.917,81.324],
['三亚','海南',18.253,109.512],['香港','香港',22.319,114.169],['澳门','澳门',22.199,113.544],['台北','台湾',25.033,121.565],
// 补充 API 覆盖不到的城市
['锡林浩特','内蒙古',43.933,116.086],['乌兰浩特','内蒙古',46.073,122.093],['通辽','内蒙古',43.617,122.266],
['呼伦贝尔','内蒙古',49.212,119.765],['巴彦淖尔','内蒙古',40.743,107.388],['乌兰察布','内蒙古',40.994,113.134],
['乌海','内蒙古',39.655,106.795],['阿拉善','内蒙古',38.851,105.729],
['林芝','西藏',29.654,94.362],['日喀则','西藏',29.265,88.880],
['玉树','青海',32.993,97.009],['海东','青海',36.502,102.104],
['固原','宁夏',36.016,106.243],['中卫','宁夏',37.500,105.197],['吴忠','宁夏',37.997,106.198],
['石嘴山','宁夏',38.984,106.384],
['铜川','陕西',34.897,108.945],['安康','陕西',32.685,109.029],['商洛','陕西',33.873,109.940],
['庆阳','甘肃',35.710,107.643],['武威','甘肃',37.928,102.638],['平凉','甘肃',35.543,106.665],
['定西','甘肃',35.581,104.626],['陇南','甘肃',33.401,104.922],['临夏','甘肃',35.601,103.243],
['甘南','甘肃',34.983,102.911],['白银','甘肃',36.545,104.138],['金昌','甘肃',38.521,102.188],
['嘉峪关','甘肃',39.773,98.290],
['攀枝花','四川',26.582,101.719],['自贡','四川',29.339,104.778],['内江','四川',29.580,105.058],
['广元','四川',32.435,105.844],['遂宁','四川',30.533,105.593],['眉山','四川',30.077,103.849],
['广安','四川',30.456,106.633],['达州','四川',31.209,107.468],['雅安','四川',29.984,103.013],
['巴中','四川',31.867,106.748],['资阳','四川',30.129,104.627],
['凉山','四川',27.882,102.267],['阿坝','四川',31.899,102.225],['甘孜','四川',30.051,101.964],
['百色','广西',23.902,106.618],['钦州','广西',21.980,108.654],['防城港','广西',21.687,108.355],
['贵港','广西',23.112,109.599],['玉林','广西',22.654,110.181],['贺州','广西',24.404,111.567],
['河池','广西',24.693,108.085],['来宾','广西',23.750,109.222],['崇左','广西',22.379,107.365],
['德宏','云南',24.433,98.585],['红河','云南',23.366,103.375],['文山','云南',23.399,104.215],
['西双版纳','云南',22.009,100.797],['楚雄','云南',25.045,101.528],['保山','云南',25.112,99.169],
['普洱','云南',22.825,100.967],['玉溪','云南',24.351,102.547],['昭通','云南',27.338,103.717],
['临沧','云南',23.884,100.090],['怒江','云南',25.851,98.857],['迪庆','云南',27.826,99.702],
['铜仁','贵州',27.732,109.190],['黔南','贵州',26.254,107.523],['黔东南','贵州',26.583,107.983],
['黔西南','贵州',25.090,104.904],
['鹤壁','河南',35.748,114.297],['濮阳','河南',35.762,115.029],['漯河','河南',33.581,114.017],
['三门峡','河南',34.773,111.194],['焦作','河南',35.216,113.242],
['荆门','湖北',31.035,112.199],['鄂州','湖北',30.391,114.895],['咸宁','湖北',29.841,114.322],
['随州','湖北',31.690,113.383],['恩施','湖北',30.283,109.487],
['永州','湖南',26.420,111.613],['怀化','湖南',27.569,109.999],['娄底','湖南',27.697,111.996],
['益阳','湖南',28.554,112.355],['张家界','湖南',29.117,110.479],['湘西','湖南',28.312,109.739],
['衡水','河北',37.739,115.669],['承德','河北',40.952,117.962],['张家口','河北',40.824,114.888],
['日照','山东',35.416,119.527],['莱芜','山东',36.214,117.677],
['晋中','山西',37.687,112.753],['吕梁','山西',37.519,111.142],['晋城','山西',35.491,112.852],
['朔州','山西',39.332,112.433],['忻州','山西',38.416,112.734],['阳泉','山西',37.857,113.581],
['铁岭','辽宁',42.224,123.727],['朝阳','辽宁',41.573,120.451],['盘锦','辽宁',41.120,122.071],
['葫芦岛','辽宁',40.711,120.837],['阜新','辽宁',42.022,121.670],
['鸡西','黑龙江',45.295,130.969],['鹤岗','黑龙江',47.350,130.298],['双鸭山','黑龙江',46.647,131.158],
['伊春','黑龙江',47.728,128.841],['佳木斯','黑龙江',46.800,130.318],['七台河','黑龙江',45.771,131.003],
['黑河','黑龙江',50.246,127.489],['绥化','黑龙江',46.654,126.969],['大兴安岭','黑龙江',52.335,124.711],
['白山','吉林',41.941,126.424],['白城','吉林',45.620,122.839],['松原','吉林',45.142,124.825],
['辽源','吉林',42.888,125.144],
['莆田','福建',25.454,119.008],['三明','福建',26.263,117.638],['南平','福建',26.642,118.177],
['宁德','福建',26.666,119.548],['龙岩','福建',25.075,117.017],
['宣城','安徽',30.941,118.759],['滁州','安徽',32.256,118.333],['阜阳','安徽',32.890,115.814],
['宿州','安徽',33.647,116.964],['六安','安徽',31.736,116.520],['亳州','安徽',33.845,115.779],
['池州','安徽',30.665,117.491],['黄山','安徽',29.715,118.338],['马鞍山','安徽',31.670,118.506],
['淮北','安徽',33.955,116.798],['铜陵','安徽',30.945,117.812],['淮南','安徽',32.626,116.998],
['鹰潭','江西',28.260,117.069],['新余','江西',27.818,114.917],['萍乡','江西',27.623,113.855],
['宜春','江西',27.816,114.416],['上饶','江西',28.455,117.943],['吉安','江西',27.114,114.994],
['抚州','江西',27.949,116.358],
['潮州','广东',23.657,116.622],['汕尾','广东',22.786,115.375],['河源','广东',23.743,114.700],
['阳江','广东',21.858,111.983],['云浮','广东',22.915,112.045],
['泰州','江苏',32.456,119.926],['宿迁','江苏',33.963,118.275],['连云港','江苏',34.597,119.221],
];

// 区县→地级市映射
const COUNTY = {
'义乌':'金华','东阳':'金华','永康':'金华','慈溪':'宁波','余姚':'宁波','诸暨':'绍兴','海宁':'嘉兴','桐乡':'嘉兴',
'温岭':'台州','临海':'台州','乐清':'温州','瑞安':'温州','建德':'杭州','富阳':'杭州','临安':'杭州',
'江阴':'无锡','宜兴':'无锡','昆山':'苏州','常熟':'苏州','张家港':'苏州','太仓':'苏州',
'丹阳':'镇江','句容':'镇江','溧阳':'常州','金坛':'常州','如皋':'南通','海门':'南通','启东':'南通',
'兴化':'泰州','靖江':'泰州','泰兴':'泰州','东台':'盐城','大丰':'盐城','新沂':'徐州','邳州':'徐州',
'仪征':'扬州','高邮':'扬州','盱眙':'淮安','洪泽':'淮安','沭阳':'宿迁','东海':'连云港','赣榆':'连云港',
'晋江':'泉州','石狮':'泉州','南安':'泉州','福清':'福州','长乐':'福州',
'胶州':'青岛','即墨':'青岛','平度':'青岛','龙口':'烟台','莱州':'烟台','招远':'烟台','蓬莱':'烟台',
'寿光':'潍坊','诸城':'潍坊','青州':'潍坊','高密':'潍坊','荣成':'威海','乳山':'威海','文登':'威海',
'新泰':'泰安','肥城':'泰安','曲阜':'济宁','邹城':'济宁','兖州':'济宁','梁山':'济宁','滕州':'枣庄','章丘':'济南',
'乐陵':'德州','禹城':'德州','临清':'聊城','邹平':'滨州','曹县':'菏泽','广饶':'东营',
'登封':'郑州','新密':'郑州','新郑':'郑州','巩义':'郑州','偃师':'洛阳','禹州':'许昌','长葛':'许昌',
'汝州':'平顶山','林州':'安阳','卫辉':'新乡','辉县':'新乡','永城':'商丘','项城':'周口','邓州':'南阳','灵宝':'三门峡',
'辛集':'石家庄','藁城':'石家庄','晋州':'石家庄','遵化':'唐山','迁安':'唐山','武安':'邯郸',
'涿州':'保定','定州':'保定','高碑店':'保定','任丘':'沧州','泊头':'沧州','河间':'沧州','黄骅':'沧州',
'霸州':'廊坊','三河':'廊坊','沙河':'邢台','南宫':'邢台','深州':'衡水','冀州':'衡水',
'大冶':'黄石','丹江口':'十堰','宜都':'宜昌','枝江':'宜昌','当阳':'宜昌',
'老河口':'襄阳','枣阳':'襄阳','钟祥':'荆门','汉川':'孝感','麻城':'黄冈','赤壁':'咸宁',
'醴陵':'株洲','湘乡':'湘潭','耒阳':'衡阳','武冈':'邵阳','汨罗':'岳阳','津市':'常德','沅江':'益阳','吉首':'湘西','浏阳':'长沙',
'瓦房店':'大连','庄河':'大连','海城':'鞍山','东港':'丹东','凤城':'丹东','凌海':'锦州','盖州':'营口','大石桥':'营口',
'灯塔':'辽阳','调兵山':'铁岭','开原':'铁岭','北票':'朝阳','凌源':'朝阳','兴城':'葫芦岛',
'德惠':'长春','榆树':'长春','公主岭':'长春','蛟河':'吉林市','桦甸':'吉林市','舒兰':'吉林市','磐石':'吉林市',
'梨树':'四平','梅河口':'通化','集安':'通化','扶余':'松原','洮南':'白城','延吉':'延边','敦化':'延边','珲春':'延边',
'尚志':'哈尔滨','五常':'哈尔滨','讷河':'齐齐哈尔','虎林':'鸡西','密山':'鸡西',
'铁力':'伊春','同江':'佳木斯','富锦':'佳木斯','绥芬河':'牡丹江','海林':'牡丹江','宁安':'牡丹江',
'北安':'黑河','五大连池':'黑河','安达':'绥化','肇东':'绥化','海伦':'绥化',
'巢湖':'合肥','桐城':'安庆','明光':'滁州','天长':'滁州','广德':'宣城',
'瑞金':'赣州','井冈山':'吉安','樟树':'宜春','丰城':'宜春','高安':'宜春','贵溪':'鹰潭','乐平':'景德镇','德兴':'上饶',
'韩城':'渭南','华阴':'渭南','兴平':'咸阳','神木':'榆林',
'都江堰':'成都','彭州':'成都','崇州':'成都','邛崃':'成都','广汉':'德阳','什邡':'德阳','绵竹':'德阳','江油':'绵阳',
'阆中':'南充','峨眉山':'乐山','射洪':'遂宁','隆昌':'内江',
'汾阳':'吕梁','孝义':'吕梁','介休':'晋中','原平':'忻州','侯马':'临汾','霍州':'临汾','永济':'运城','河津':'运城',
'高平':'晋城','怀仁':'朔州','古交':'太原','潞城':'长治',
'仁怀':'遵义','赤水':'遵义','敦煌':'酒泉','玉门':'酒泉','灵武':'银川','格尔木':'海西',
'大理市':'大理','瑞丽':'德宏','腾冲':'保山','弥勒':'红河','宣威':'曲靖','安宁':'昆明',
'文昌':'海口','琼海':'海口','万宁':'海口','桂平':'贵港','北流':'玉林','岑溪':'梧州','东兴':'防城港',
'都匀':'黔南','凯里':'黔东南','兴义':'黔西南','清镇':'贵阳','库尔勒':'巴音郭楞','武夷山':'南平','福安':'宁德','福鼎':'宁德','永安':'三明',
'江宁':'南京','浦口':'南京','六合':'南京','溧水':'南京','高淳':'南京',
'萧山':'杭州','余杭':'杭州','鹿城':'温州','瓯海':'温州','越城':'绍兴','柯桥':'绍兴','婺城':'金华','南湖':'嘉兴','吴兴':'湖州','椒江':'台州',
'禅城':'佛山','南海':'佛山','惠城':'惠州','惠阳':'惠州','天河':'广州','福田':'深圳','南山':'深圳','宝安':'深圳','龙岗':'深圳',
'鼓楼区':'南京','云龙':'徐州','武进':'常州','瑶海':'合肥','蜀山':'合肥','包河':'合肥','镜湖':'芜湖',
'历下':'济南','历城':'济南','市南':'青岛','芝罘':'烟台','张店':'淄博','兰山':'临沂',
'碑林':'西安','雁塔':'西安','未央':'西安','青羊':'成都','武侯区':'成都','金牛区':'成都',
'江岸':'武汉','武昌区':'武汉','洪山区':'武汉','西陵':'宜昌',
'岳麓':'长沙','芙蓉':'长沙','天心':'长沙','中原区':'郑州','金水':'郑州',
'和平区':'沈阳','铁西区':'沈阳','沈河':'沈阳','中山区':'大连',
'道里':'哈尔滨','南岗':'哈尔滨','朝阳区':'长春','南关区':'长春',
'新华区':'石家庄','桥西区':'石家庄','迎泽':'太原','万柏林':'太原',
'城关区':'兰州','青秀':'南宁','象山区':'桂林','赛罕':'呼和浩特','昆都仑':'包头',
'五华区':'昆明','盘龙':'昆明','官渡区':'昆明','古城':'丽江',
'秀英':'海口','龙华区':'海口','海棠':'三亚','吉阳':'三亚',
'仓山':'福州','台江':'福州','思明':'厦门','湖里':'厦门','丰泽':'泉州',
'涧西':'洛阳','樊城':'襄阳','萨尔图':'大庆','任城':'济宁','岚山':'日照',
'东昌府':'聊城','德城':'德州','滨城':'滨州','牡丹区':'菏泽','薛城':'枣庄','东营区':'东营',
'湟中':'西宁','乐都':'海东','平安':'海东','贵德':'海南藏族自治州',
'延吉市':'延边','图们市':'延边','敦化市':'延边','珲春市':'延边',
'冷水滩':'永州','零陵':'永州','鹤城':'怀化','永定':'张家界',
'西昌':'凉山','马尔康':'阿坝','康定':'甘孜','汶川':'阿坝',
'碧江':'铜仁','七星关':'毕节','西秀':'安顺',
'麒麟':'曲靖','红塔':'玉溪','隆阳':'保山','思茅':'普洱',
'临渭':'渭南','汉台':'汉中','榆阳':'榆林','汉滨':'安康',
'肃州':'酒泉','甘州':'张掖','凉州':'武威','崆峒':'平凉',
'伊州':'哈密','高昌':'吐鲁番','阿图什':'克孜勒苏',
'海拉尔区':'呼伦贝尔','集宁':'乌兰察布','临河':'巴彦淖尔',
};

// 将 COUNTY 中的区县同步到 DB
for (const [cn, pn] of Object.entries(COUNTY)) {
    const p = DB.find(c => c[0] === pn);
    if (p && !DB.some(c => c[0] === cn)) DB.push([cn, p[1], p[2] + (Math.random()-0.5)*0.02, p[3] + (Math.random()-0.5)*0.02]);
}

function findCity(lat, lon) {
    let best = null, bestD = Infinity;
    for (const [n, p, clat, clon] of DB) {
        const d = (clat - lat)**2 + (clon - lon)**2;
        if (d < bestD) { bestD = d; best = n; }
    }
    return bestD < 0.5 ? best : null;
}

function searchLocal(q) {
    let s = q;
    for (const sf of ['自治县','自治州','县级市','开发区','新区','特区','地区','街道','市','县','区','镇','乡']) {
        if (s.endsWith(sf)) { s = s.slice(0, -sf.length); break; }
    }
    s = s.toLowerCase().trim();
    if (s.length < 2) return [];
    const scored = [];
    for (const [n, p, lat, lon] of DB) {
        const nl = n.toLowerCase(); let sc = 0;
        if (nl === s) sc = 100;
        else if (nl.startsWith(s)) sc = 80;
        else if (s.startsWith(nl)) sc = 75;
        else if (nl.includes(s)) sc = 60;
        else if (s.includes(nl)) sc = 55;
        else if (s.length >= 2 && nl.length >= 2 && nl.slice(0, 2) === s.slice(0, 2)) sc = 40;
        if (sc > 0) scored.push({ name: n, admin1: p, country: '中国', lat, lon, _s: sc });
    }
    scored.sort((a, b) => b._s - a._s);
    return scored.slice(0, 5).map(({ _s, ...c }) => c);
}

// === 搜索 ===
async function doSearch(query) {
    // 过滤机场、车站等非城市 feature_code
    const NOT_CITY = /\b(机场|航空|车站|高铁|服务区|收费站|隧道|大桥|加油|停车|公墓|陵园)\b/;
    const nameOK = n => n && !NOT_CITY.test(n) && n.length >= 2;

    const qs = [query];
    if (!query.endsWith('市') && !query.endsWith('县') && !query.endsWith('区') && query.length <= 4) qs.push(query + '市');
    if (query.endsWith('市') || query.endsWith('县') || query.endsWith('区')) qs.push(query.slice(0, -1));

    const all = [];
    for (const q of qs) {
        const r = await geoSearch(q);
        for (const c of r) {
            if (!nameOK(c.name)) continue;  // 跳过机场、车站
            let prio = 0;
            if (q.endsWith('市')) prio += 10;
            if (c.country === '中国') prio += 8;
            if (c.name === q) prio += 4;
            if (c.admin1 && ['北京','上海','天津','重庆','广东','江苏','浙江'].includes(c.admin1)) prio += 2;
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
    const cleaned = uniq.slice(0, 5).map(({ _prio, ...c }) => c);

    // 本地 DB 精确匹配的城市强制排第一（覆盖 API 不准的情况）
    const local = searchLocal(query);
    if (local.length > 0) {
        const topLocal = local[0];
        // 移除 cleaned 中与 topLocal 重复的条目（按名称）
        const filtered = cleaned.filter(c => c.name !== topLocal.name || c.admin1 !== topLocal.admin1);
        filtered.unshift(topLocal);
        return filtered;
    }

    return cleaned.length ? cleaned : [];
}

// === UI 渲染 ===
function toggle(id) { ['loading','weather-card','error-card'].forEach(x => $(x).classList.toggle('hidden', $(x).id !== id)); }

function resolveCity(loc) { if (loc.city && loc.city !== '当前位置' && !/^[A-Za-z]/.test(loc.city)) return loc.city; const cn = findCity(loc.lat, loc.lon); return cn || loc.city || '未知'; }

function renderWeather(loc, wx) {
    const cur = wx.current_weather, h = wx.hourly, d = wx.daily;
    const name = resolveCity(loc);
    $('city').textContent = name;
    $('region').textContent = [loc.region || loc.admin1, loc.country].filter(Boolean).join('，') || '';
    $('weather-icon').textContent = ICON(cur.weathercode);
    $('temperature').textContent = state.unit === 'fahrenheit' ? F.c2f(cur.temperature) + '°F' : Math.round(cur.temperature) + '°';
    $('weather-desc').textContent = DESC(cur.weathercode);

    // 详情网格
    const grid = $('details-grid'); grid.innerHTML = '';
    const items = [];
    if (h.apparent_temperature?.[0] != null) items.push(['🌡️','体感',F.ftemp(h.apparent_temperature[0], state.unit)]);
    if (h.relativehumidity_2m?.[0] != null) items.push(['💧','湿度',h.relativehumidity_2m[0] + '%']);
    items.push(['🌬️','风速',cur.windspeed + ' km/h']);
    if (h.uv_index?.[0] != null) { const uv = h.uv_index[0]; const lvl = uv <= 2 ? '低' : uv <= 5 ? '中' : uv <= 7 ? '高' : uv <= 10 ? '很高' : '极高'; items.push(['☀️','紫外线',uv + ' ' + lvl]); }
    if (h.precipitation_probability?.[0] != null) items.push(['🌧️','降雨概率',h.precipitation_probability[0] + '%']);
    if (h.pressure_msl?.[0] != null) items.push(['🔵','气压',Math.round(h.pressure_msl[0]) + ' hPa']);
    if (d?.sunrise?.[0]) items.push(['🌅','日出',F.time(d.sunrise[0])]);
    if (d?.sunset?.[0]) items.push(['🌇','日落',F.time(d.sunset[0])]);
    if (h.cloudcover?.[0] != null) items.push(['☁️','云量',h.cloudcover[0] + '%']);
    if (wx.elevation != null) items.push(['⛰️','海拔',Math.round(wx.elevation) + ' m']);
    items.forEach(([icon,label,value]) => {
        const div = document.createElement('div'); div.className = 'detail-cell';
        div.innerHTML = `<span class="di">${icon}</span><span class="dl">${label}</span><span class="dv">${value}</span>`;
        grid.appendChild(div);
    });

    // 7天预报
    const dl = $('daily-list'); dl.innerHTML = '';
    for (let i = 0; i < (d?.time?.length || 0); i++) {
        const hi = F.ftemp(d.temperature_2m_max[i], state.unit), lo = F.ftemp(d.temperature_2m_min[i], state.unit);
        const precip = d.precipitation_probability_max?.[i] || 0;
        dl.innerHTML += `<div class="day-card"><div class="day-name">${F.day(d.time[i])}</div><div class="day-icon">${ICON(d.weathercode[i])}</div><div class="day-temps"><span class="dt-hi">${hi}</span><span class="dt-lo">${lo}</span></div>${precip > 0 ? `<div class="day-rain">💧${precip}%</div>` : ''}</div>`;
    }

    // 建议
    const code = cur.weathercode, temp = cur.temperature, wind = cur.windspeed, daytime = cur.is_day === 1;
    const cloth = getClothing(temp, code, wind);
    const activ = getActivity(temp, code, wind, daytime);
    renderAdvice('clothing-main', 'clothing-tags', cloth);
    renderAdvice('activity-main', 'activity-tags', activ);

    // 粒子背景
    updateBg(code, daytime);

    // 先显示卡片，再画图表（否则canvas尺寸为0）
    toggle('weather-card');

    if (h.time?.length > 0) {
        if (!state.chart) state.chart = new TempChart($('temp-chart'));
        requestAnimationFrame(() => state.chart.update(h, state.unit));
    }
}

function renderAdvice(mid, tid, adv) {
    $(mid).textContent = adv.text;
    $(tid).innerHTML = adv.tags.map(t => `<span class="advice-chip">${t}</span>`).join('');
}

// === 穿衣 & 活动 ===
function getClothing(t, code, w) {
    const r = { text: '', tags: [] };
    if (t >= 35) { r.text = '炎热，轻薄透气短袖短裤'; r.tags = ['短袖👕','短裤🩳','遮阳帽🧢','防晒霜🧴']; }
    else if (t >= 28) { r.text = '较热，短袖配短裤或薄长裤'; r.tags = ['短袖👕','薄长裤','遮阳帽🧢']; }
    else if (t >= 22) { r.text = '舒适，T恤衬衫配长裤'; r.tags = ['T恤👕','衬衫👔','长裤👖']; }
    else if (t >= 16) { r.text = '稍凉，长袖或薄卫衣'; r.tags = ['长袖🧥','卫衣','薄外套']; }
    else if (t >= 10) { r.text = '偏凉，卫衣加夹克'; r.tags = ['卫衣','夹克🧥','长裤👖']; }
    else if (t >= 5) { r.text = '有点冷，毛衣配外套'; r.tags = ['毛衣','厚外套🧥']; }
    else if (t >= 0) { r.text = '寒冷，厚外套加毛衣围巾'; r.tags = ['棉服🧥','毛衣','围巾🧣','手套🧤']; }
    else if (t >= -10) { r.text = '非常冷，羽绒服全副武装'; r.tags = ['羽绒服🧥','毛衣','围巾🧣','手套🧤','帽子']; }
    else { r.text = '极寒，最强保暖减少外出'; r.tags = ['厚羽绒服🧥','多层保暖','围巾🧣','手套🧤','雪地靴👢']; }
    if (isRain(code)) { r.text += '，记得带伞'; r.tags.push('雨伞☂️'); }
    if (isSnow(code)) { r.tags.push('防滑靴👢','厚袜🧦'); }
    if (isStorm(code)) { r.text = '雷暴，尽量别出门！'; r.tags.push('雨伞☂️','雨衣','远离树木⚠️'); }
    if (w > 25) r.tags.push('防风外套💨');
    r.tags = [...new Set(r.tags)];
    return r;
}

function getActivity(t, code, w, daytime) {
    const r = { text: '', tags: [] };
    if (isStorm(code)) { r.text = '雷暴，留在室内！'; r.tags = ['阅读📚','电影🎬','室内健身🏋️','桌游🎲','烹饪🍳']; }
    else if (isRain(code)) { r.text = '下雨，适合室内活动'; r.tags = ['室内健身🏋️','瑜伽🧘','游泳🏊','攀岩🧗','电影🎬','逛商场🛍️']; }
    else if (isSnow(code)) { r.text = '下雪，可玩雪注意保暖'; r.tags = ['滑雪⛷️','堆雪人⛄','室内健身🏋️','温泉♨️']; }
    else if (isFog(code)) { r.text = '雾天，建议室内活动'; r.tags = ['室内健身🏋️','瑜伽🧘','阅读📚','电影🎬']; }
    else if (t > 35) { r.text = '高温！避免中午户外运动'; r.tags = ['游泳🏊','水上乐园🌊','室内健身🏋️','傍晚散步🚶']; }
    else if (t >= 30) { r.text = '较热，适合水上和早晚运动'; r.tags = ['游泳🏊','骑行🚴','晨跑🏃','公园散步🚶']; }
    else if (t >= 22) { r.text = '天气完美，适合户外运动！'; r.tags = ['跑步🏃','骑行🚴','徒步🥾','篮球🏀','足球⚽','羽毛球🏸']; }
    else if (t >= 15) { r.text = '不错，很适合户外运动'; r.tags = ['慢跑🏃','骑行🚴','徒步🥾','摄影📷']; }
    else if (t >= 5) { r.text = '偏凉，运动前充分热身'; r.tags = ['慢跑🏃','骑行🚴','徒步🥾','摄影📷']; }
    else { r.text = '较冷，运动注意防寒'; r.tags = ['慢跑🏃','室内健身🏋️']; }
    return r;
}


// === 粒子背景 ===
// 根据天气代码确定粒子配置：类型、数量、速度、粗细、闪电
function getParticleConfig(code, daytime) {
    const lightRain = [51,53,56,61,80];
    const modRain = [55,63,81];
    const heavyRain = [65,82];
    if (isStorm(code)) return {type:'storm',count:200,speed:900,thick:2.5,lightning:true};
    if (heavyRain.includes(code)) return {type:'rain',count:200,speed:800,thick:2,lightning:false};
    if (modRain.includes(code)) return {type:'rain',count:120,speed:600,thick:1.5,lightning:false};
    if (lightRain.includes(code)) return {type:'rain',count:60,speed:400,thick:1,lightning:false};
    if (isSnow(code)) return {type:'snow',count:80,speed:40,thick:0,lightning:false};
    if (isFog(code)) return {type:'fog',count:10,speed:8,thick:0,lightning:false};
    if (isClear(code)) return {type:daytime?'sun':'stars',count:daytime?40:100,speed:0,thick:0,lightning:false};
    return null;
}
function updateBg(code, daytime) {
    const bg = $('bg-canvas'); if (!bg) return;
    const cfg = getParticleConfig(code, daytime);
    if (!state.particles) state.particles = new ParticleBg(bg);
    state.particles.start(cfg);
    document.body.className = isStorm(code)?'bg-storm':isSnow(code)?'bg-snow':isRain(code)?'bg-rain':isFog(code)?'bg-fog':'bg-clear';
}
class ParticleBg {
    constructor(cvs) {
        this.cvs=cvs; this.ctx=cvs.getContext('2d'); this.ps=[]; this.cfg=null; this._id=null; this._flash=0;
        this._resize(); this._onResize=()=>this._resize(); window.addEventListener('resize',this._onResize);
    }
    _resize() {
        const dpr=devicePixelRatio||1;
        this.cvs.width=innerWidth*dpr; this.cvs.height=innerHeight*dpr; this.W=innerWidth; this.H=innerHeight; this.dpr=dpr;
    }
    start(cfg) {
        if(this._id) cancelAnimationFrame(this._id);
        if(!cfg){this.ps=[];this.cfg=null;this.ctx.clearRect(0,0,this.cvs.width,this.cvs.height);return;}
        this.cfg=cfg; this._flash=0;
        this.ps=[];
        for(let i=0;i<cfg.count;i++){
            this.ps.push({
                x:Math.random()*this.W, y:Math.random()*this.H,
                len:cfg.thick>1?8+Math.random()*16:4+Math.random()*10,
                spd:cfg.speed*(0.6+Math.random()*0.8),
                op:0.1+Math.random()*0.3,
                wind:cfg.type==='snow'?-20+Math.random()*40:0,
                phase:Math.random()*Math.PI*2,
                r:cfg.type==='snow'?1+Math.random()*2.5:cfg.type==='sun'?1+Math.random()*2:cfg.type==='stars'?0.5+Math.random()*1.5:cfg.type==='fog'?60+Math.random()*140:0,
                twinkle:0.5+Math.random()*2, baseOp:0.3+Math.random()*0.7,
            });
        }
        this._last=performance.now(); this._tick(this._last);
    }
    _tick(now) {
        if(!this.cfg)return;
        const dt=Math.min((now-this._last)/1000,0.1); this._last=now;
        const ctx=this.ctx,W=this.W,H=this.H,dpr=this.dpr;
        ctx.setTransform(dpr,0,0,dpr,0,0);
        ctx.clearRect(0,0,W,H);
        const {type,thick}=this.cfg;
        for(const p of this.ps){
            switch(type){
                case'rain':case'storm':p.y+=p.spd*dt;if(p.y>H+p.len){p.y=-p.len;p.x=Math.random()*W;}break;
                case'snow':p.y+=p.spd*dt;p.x+=Math.sin(p.y*0.004+p.phase)*p.wind*dt;if(p.y>H+p.r){p.y=-p.r;p.x=Math.random()*W;}if(p.x<-p.r)p.x=W+p.r;if(p.x>W+p.r)p.x=-p.r;break;
                case'sun':p.y-=p.spd*dt;p.x+=p.wind*dt;if(p.y<-p.r){p.y=H+p.r;p.x=Math.random()*W;}break;
                case'fog':p.x+=p.spd*dt;if(p.x>W+p.r)p.x=-p.r;if(p.x<-p.r)p.x=W+p.r;break;
            }
            ctx.save();
            switch(type){
                case'rain':case'storm':ctx.strokeStyle='rgba(180,210,240,'+p.op+')';ctx.lineWidth=thick;ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(p.x-thick*0.5,p.y+p.len);ctx.stroke();break;
                case'snow':ctx.fillStyle='rgba(255,255,255,'+p.op+')';ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,Math.PI*2);ctx.fill();break;
                case'sun':ctx.fillStyle='rgba(255,220,150,'+(p.op*(0.5+0.5*Math.sin(now*0.001+p.x)))+')';ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,Math.PI*2);ctx.fill();break;
                case'stars':const tw=p.baseOp*(0.4+0.6*Math.sin(now*0.001*p.twinkle+p.phase));ctx.fillStyle='rgba(255,255,255,'+tw+')';ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,Math.PI*2);ctx.fill();break;
                case'fog':const g=ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,p.r);g.addColorStop(0,'rgba(200,210,220,'+p.op+')');g.addColorStop(1,'rgba(200,210,220,0)');ctx.fillStyle=g;ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,Math.PI*2);ctx.fill();break;
            }
            ctx.restore();
        }
        if(this.cfg.lightning){this._flash*=0.88;if(Math.random()<0.015*dt*60){this._flash=0.15+Math.random()*0.15;}if(this._flash>0.005){ctx.fillStyle='rgba(255,255,255,'+this._flash+')';ctx.fillRect(0,0,W,H);}}
        this._id=requestAnimationFrame(t=>this._tick(t));
    }
}


// === Canvas 温度趋势图 ===
class TempChart {
    constructor(cvs) { this.cvs = cvs; this.ctx = cvs.getContext('2d'); this.tip = null; this._createTip(); this._onResize = () => this._draw(); window.addEventListener('resize', this._onResize); }
    update(h, unit) { this.data = h; this.unit = unit; this._draw(); }
    _createTip() { this.tip = document.createElement('div'); this.tip.className = 'chart-tip hidden'; this.tip.style.cssText = 'position:absolute;pointer-events:none;background:rgba(0,0,0,.85);color:#fff;padding:5px 10px;border-radius:6px;font-size:12px;z-index:10;font-family:monospace'; this.cvs.parentElement.appendChild(this.tip); this.cvs.addEventListener('mousemove', e => this._onMove(e)); this.cvs.addEventListener('mouseleave', () => this.tip.classList.add('hidden')); }
    _onMove(e) {
        if (!this.data) return;
        const r = this.cvs.getBoundingClientRect(), mx = e.clientX - r.left;
        const t = this.data.time, tmp = this.data.temperature_2m;
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
        this.cvs.width = W * dpr; this.cvs.height = H * dpr;
        const ctx = this.ctx; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const pad = { t: 16, r: 16, b: 28, l: 40 }, pw = W - pad.l - pad.r, ph = H - pad.t - pad.b;
        if (pw < 0 || ph < 0) return;
        let min = Math.min(...temps) - 2, max = Math.max(...temps) + 2;
        const range = max - min || 5;
        const xf = i => pad.l + i / (temps.length - 1) * pw;
        const yf = v => pad.t + ph - (v - min) / range * ph;
        ctx.fillStyle = 'rgba(255,255,255,0.03)'; ctx.fillRect(pad.l, pad.t, pw, ph);
        ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.lineWidth = 0.5;
        for (let i = 0; i <= 4; i++) { const y = pad.t + ph / 4 * i, val = max - range / 4 * i; ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(pad.l + pw, y); ctx.stroke(); ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.font = '10px sans-serif'; ctx.textAlign = 'right'; ctx.fillText(F.ftemp(Math.round(val), this.unit), pad.l - 6, y + 4); }
        const step = Math.max(1, Math.floor(temps.length / 8));
        ctx.textAlign = 'center';
        for (let i = 0; i < temps.length; i += step) { ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.fillText(F.time(time[i]), xf(i), pad.t + ph + 16); }
        const grad = ctx.createLinearGradient(0, pad.t, 0, pad.t + ph);
        grad.addColorStop(0, 'rgba(79,195,247,0.3)'); grad.addColorStop(1, 'rgba(79,195,247,0)');
        ctx.beginPath(); ctx.moveTo(xf(0), yf(temps[0]));
        for (let i = 1; i < temps.length; i++) { const xc = (xf(i-1) + xf(i)) / 2; ctx.bezierCurveTo(xc, yf(temps[i-1]), xc, yf(temps[i]), xf(i), yf(temps[i])); }
        ctx.lineTo(xf(temps.length-1), pad.t + ph); ctx.lineTo(xf(0), pad.t + ph); ctx.closePath();
        ctx.fillStyle = grad; ctx.fill();
        ctx.beginPath(); ctx.moveTo(xf(0), yf(temps[0]));
        for (let i = 1; i < temps.length; i++) { const xc = (xf(i-1) + xf(i)) / 2; ctx.bezierCurveTo(xc, yf(temps[i-1]), xc, yf(temps[i]), xf(i), yf(temps[i])); }
        ctx.strokeStyle = 'rgba(79,195,247,0.9)'; ctx.lineWidth = 2; ctx.stroke();
        for (let i = 0; i < temps.length; i++) { ctx.beginPath(); ctx.arc(xf(i), yf(temps[i]), 2, 0, Math.PI * 2); ctx.fillStyle = 'rgba(79,195,247,0.7)'; ctx.fill(); }
    }
}

// === 定位 & 加载 ===
async function init() {
    let loc = null;

    // GPS 优先
    if ('geolocation' in navigator) {
        try {
            const pos = await new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, { timeout: 5000, maximumAge: 600000 }));
            const name = findCity(pos.coords.latitude, pos.coords.longitude);
            loc = { city: name || '当前位置', region: '', country: '', lat: pos.coords.latitude, lon: pos.coords.longitude };
        } catch {}
    }

    // IP 兜底
    if (!loc) {
        try { loc = await ipLocation(); } catch {}
    }

    // 加载天气
    if (loc) {
        try {
            const wx = await getWeather(loc.lat, loc.lon);
            state.city = loc; state.weather = wx;
            localStorage.setItem('wx_last', JSON.stringify({ loc, wx, ts: Date.now() }));
            renderWeather(loc, wx);
        } catch (e) {
            // 尝试缓存
            const raw = localStorage.getItem('wx_last');
            if (raw) {
                const cache = JSON.parse(raw);
                renderWeather(cache.loc, cache.wx);
                $('error-msg').textContent = '显示缓存数据（' + new Date(cache.ts).toLocaleTimeString() + '）';
                toggle('weather-card');
            } else {
                $('error-msg').textContent = e.message; toggle('error-card');
            }
        }
    } else {
        // 最终兜底：北京
        try {
            const wx = await getWeather(39.904, 116.407);
            renderWeather({ city: '北京', region: '', country: '中国', lat: 39.904, lon: 116.407 }, wx);
        } catch (e) {
            $('error-msg').textContent = '网络异常，请检查连接'; toggle('error-card');
        }
    }
}

// === 搜索UI ===
function initSearch() {
    const inp = $('search-input'), clr = $('search-clear'), res = $('search-results'), recent = $('recent-list'), rsec = $('recent-section');
    let last = [];

    const search = F.debounce(async q => {
        if (q.length < 2) { res.classList.add('hidden'); last = []; return; }
        last = await doSearch(q);
        res.innerHTML = ''; res.classList.remove('hidden');
        if (!last.length) { res.classList.add('hidden'); return; }
        for (const c of last) {
            const li = document.createElement('li'); li.className = 'search-item';
            li.innerHTML = `<span class="si-name">${c.name}</span><span class="si-meta">${[c.admin1, c.country].filter(Boolean).join('，')}</span>`;
            li.addEventListener('click', () => { selectCity(c); res.classList.add('hidden'); });
            res.appendChild(li);
        }
    }, 300);

    inp.addEventListener('input', () => { clr.classList.toggle('hidden', !inp.value); search(inp.value.trim()); });
    inp.addEventListener('keydown', async e => {
        if (e.key !== 'Enter') return; e.preventDefault();
        const q = inp.value.trim(); if (!q) return;
        if (last.length) { selectCity(last[0]); res.classList.add('hidden'); }
        else { const r = await doSearch(q); if (r.length) selectCity(r[0]); }
    });
    clr.addEventListener('click', () => { inp.value = ''; clr.classList.add('hidden'); res.classList.add('hidden'); inp.focus(); });
    document.addEventListener('click', e => { if (!e.target.closest('.search-box')) res.classList.add('hidden'); });

    // 最近搜索
    function loadRecent() {
        try { return JSON.parse(localStorage.getItem('wx_recent') || '[]'); } catch { return []; }
    }
    function renderRecent() {
        const rc = loadRecent();
        if (!rc.length) { rsec.classList.add('hidden'); return; }
        rsec.classList.remove('hidden');
        recent.innerHTML = rc.map(c => `<span class="recent-chip">${c.name}</span>`).join('');
        recent.querySelectorAll('.recent-chip').forEach((el, i) => el.addEventListener('click', () => selectCity(rc[i])));
    }
    $('clear-recent').addEventListener('click', () => { localStorage.removeItem('wx_recent'); renderRecent(); });
    renderRecent();
}

async function selectCity(c) {
    $('search-input').value = c.name; $('search-clear').classList.remove('hidden');
    try {
        const recent = JSON.parse(localStorage.getItem('wx_recent') || '[]');
        const filtered = recent.filter(x => !(Math.abs(x.lat - c.lat) < 0.01 && Math.abs(x.lon - c.lon) < 0.01));
        filtered.unshift({ name: c.name, admin1: c.admin1, country: c.country, lat: c.lat, lon: c.lon });
        localStorage.setItem('wx_recent', JSON.stringify(filtered.slice(0, 5)));
    } catch {}
    const loc = { city: c.name, region: c.admin1 || '', country: c.country || '', lat: c.lat, lon: c.lon };
    try {
        const wx = await getWeather(c.lat, c.lon);
        state.city = loc; state.weather = wx;
        renderWeather(loc, wx);
        // 写入后端查询历史
        if (authToken) {
            fetchJSON(`${API_BASE}/api/history`, 3000, { method: 'POST', body: JSON.stringify({ city: c.name, lat: c.lat, lon: c.lon, weather: DESC(wx.current_weather?.weathercode || 0) }) });
        }
    } catch (e) {
        $('error-msg').textContent = e.message; toggle('error-card');
    }
}

// === 单位切换 ===
function initUnit() {
    const btn = $('unit-btn');
    btn.addEventListener('click', () => {
        state.unit = state.unit === 'celsius' ? 'fahrenheit' : 'celsius';
        localStorage.setItem('wx_unit', state.unit);
        btn.textContent = state.unit === 'celsius' ? '°C' : '°F';
        if (state.weather) renderWeather(state.city, state.weather);
    });
}

// === 用户认证 ===
function checkAuth() {
    authToken = localStorage.getItem('wx_token') || '';
    if (authToken) {
        fetchJSON(`${API_BASE}/api/me`, 3000).then(d => {
            if (d && d.user) { currentUser = d.user; updateUserUI(); }
        }).catch(() => { logout(); });
    }
}
function updateUserUI() {
    const btn = $('user-btn');
    if (currentUser) { btn.textContent = '⭐'; btn.classList.add('logged-in'); btn.title = currentUser.username; }
    else { btn.textContent = '👤'; btn.classList.remove('logged-in'); btn.title = '登录/注册'; }
}
function logout() {
    localStorage.removeItem('wx_token'); authToken = ''; currentUser = null; updateUserUI();
    // 刷新星标
    const star = document.querySelector('.fav-star');
    if (star) { star.textContent = '☆'; star.classList.remove('active'); }
}

// 退出按钮
$('logout-btn').addEventListener('click', () => { logout(); $('fav-modal').classList.add('hidden'); });

// 用户按钮 → 收藏列表
$('user-btn').addEventListener('click', () => {
    if (currentUser) { loadFavorites(); $('fav-modal').classList.remove('hidden'); }
    else { $('auth-modal').classList.remove('hidden'); }
});

// 登录/注册
let authMode = 'login';
$('auth-toggle').addEventListener('click', (e) => {
    e.preventDefault();
    authMode = authMode === 'login' ? 'register' : 'login';
    $('auth-title').textContent = authMode === 'login' ? '登录' : '注册';
    $('auth-submit').textContent = authMode === 'login' ? '登录' : '注册';
    $('auth-msg').textContent = '';
});
$('auth-submit').addEventListener('click', async () => {
    const u = $('auth-user').value.trim(), p = $('auth-pass').value.trim();
    if (!u || !p) { $('auth-msg').textContent = '请填写用户名和密码'; return; }
    if (p.length < 6) { $('auth-msg').textContent = '密码至少6位'; return; }
    const url = `${API_BASE}${authMode === 'login' ? '/api/login' : '/api/register'}`;
    const d = await fetchJSON(url, 5000, { method: 'POST', body: JSON.stringify({ username: u, password: p }) });
    if (d && d.token) {
        localStorage.setItem('wx_token', d.token); authToken = d.token; currentUser = d.user;
        updateUserUI(); $('auth-modal').classList.add('hidden');
        $('auth-user').value = ''; $('auth-pass').value = ''; $('auth-msg').textContent = '';
    } else { $('auth-msg').textContent = (d && d.error) || '操作失败'; }
});
$('auth-close').addEventListener('click', () => $('auth-modal').classList.add('hidden'));
$('fav-close').addEventListener('click', () => $('fav-modal').classList.add('hidden'));
document.addEventListener('click', (e) => { if (e.target.classList.contains('modal-overlay')) e.target.classList.add('hidden'); });

// 收藏
async function loadFavorites() {
    const list = $('fav-list');
    $('fav-user-info').textContent = currentUser ? `当前用户：${currentUser.username}` : '';
    if (!currentUser) { list.innerHTML = '<p class="fav-empty">请先登录</p>'; return; }
    const d = await fetchJSON(`${API_BASE}/api/favorites`);
    if (!d || d.error) { list.innerHTML = '<p class="fav-empty">加载失败</p>'; return; }
    if (!d.length) { list.innerHTML = '<p class="fav-empty">暂无收藏，在天气页面点击 ⭐ 收藏城市</p>'; return; }
    list.innerHTML = d.map(f => `<div class="fav-item"><div class="fav-item-click" data-lat="${f.lat}" data-lon="${f.lon}" data-name="${f.name}" data-admin1="${f.admin1||''}" data-country="${f.country||''}"><div class="fav-item-name">${f.name}</div><div class="fav-item-meta">${f.admin1||''} ${f.country||''}</div></div><button class="fav-item-del" data-id="${f.id}">×</button></div>`).join('');
    list.querySelectorAll('.fav-item-click').forEach(el => el.addEventListener('click', () => {
        selectCity({ name: el.dataset.name, admin1: el.dataset.admin1, country: el.dataset.country, lat: parseFloat(el.dataset.lat), lon: parseFloat(el.dataset.lon) });
        $('fav-modal').classList.add('hidden');
    }));
    list.querySelectorAll('.fav-item-del').forEach(btn => btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await fetchJSON(`${API_BASE}/api/favorites/${btn.dataset.id}`, 5000, { method: 'DELETE' });
        // 更新星标状态
        const row = btn.closest('.fav-item');
        if (row) {
            const lat = parseFloat(row.querySelector('.fav-item-click').dataset.lat);
            const lon = parseFloat(row.querySelector('.fav-item-click').dataset.lon);
            updateStarState(lat, lon, false);
        }
        loadFavorites();
    }));
}
// 更新收藏星标
function updateStarState(lat, lon, isFav) {
    const star = document.querySelector('.fav-star');
    if (!star) return;
    // 检查当前显示的城市是否是更新的城市
    if (state.city && Math.abs(state.city.lat - lat) < 0.01 && Math.abs(state.city.lon - lon) < 0.01) {
        star.textContent = isFav ? '★' : '☆';
        if (isFav) star.classList.add('active'); else star.classList.remove('active');
    }
}
function addFavButton(loc) {
    const existing = document.querySelector('.fav-star'); if (existing) existing.remove();
    const star = document.createElement('button'); star.className = 'fav-star'; star.textContent = '☆'; star.title = '收藏此城市';
    star.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!currentUser) { $('auth-modal').classList.remove('hidden'); return; }
        if (star.classList.contains('active')) {
            // 取消收藏
            const d = await fetchJSON(`${API_BASE}/api/favorites`);
            if (d) {
                const fav = d.find(f => Math.abs(f.lat - loc.lat) < 0.01 && Math.abs(f.lon - loc.lon) < 0.01);
                if (fav) {
                    await fetchJSON(`${API_BASE}/api/favorites/${fav.id}`, 5000, { method: 'DELETE' });
                    star.textContent = '☆'; star.classList.remove('active');
                }
            }
        } else {
            // 添加收藏
            const d = await fetchJSON(`${API_BASE}/api/favorites`, 5000, { method: 'POST', body: JSON.stringify({ name: loc.city || loc.name, admin1: loc.region || loc.admin1 || '', country: loc.country || '', lat: loc.lat, lon: loc.lon }) });
            if (d && !d.error) { star.textContent = '★'; star.classList.add('active'); }
        }
    });
    if (currentUser) fetchJSON(`${API_BASE}/api/favorites`).then(d => {
        if (d && d.find(f => Math.abs(f.lat - loc.lat) < 0.01 && Math.abs(f.lon - loc.lon) < 0.01)) { star.textContent = '★'; star.classList.add('active'); }
    });
    $('city').after(star);
}
// 包装 renderWeather 来加收藏按钮
const _origRW = renderWeather;
renderWeather = function(loc, wx) { _origRW(loc, wx); if (loc.lat && loc.lon) addFavButton(loc); };

// === 天气地图 ===
function initMap() {
    const modal = $('map-modal');
    const container = $('map-container');
    const btn = $('map-btn');

    // 预加载 iframe（在 DOMContentLoaded 时就开始加载）
    const frame = document.createElement('iframe');
    frame.allow = 'geolocation';
    frame.style.cssText = 'width:100%;height:100%;border:none;position:absolute;top:0;left:0';
    frame.src = 'about:blank';
    container.style.position = 'relative';
    container.style.minHeight = '60vh';
    container.appendChild(frame);

    btn.addEventListener('click', () => {
        const lat = state.city?.lat || 39.9;
        const lon = state.city?.lon || 116.4;
        const url = `https://embed.windy.com/embed.html?type=map&location=coordinates&metricRain=mm&metricTemp=°C&metricWind=km/h&zoom=7&overlay=wind&product=ecmwf&lat=${lat}&lon=${lon}&detailLat=${lat}&detailLon=${lon}&detail=true&message=true`;
        // 如果还没加载或城市变了，重新设置 src
        if (frame.src !== url && !frame.src.includes('windy')) {
            frame.src = url;
        }
        modal.classList.remove('hidden');
    });
    $('map-close').addEventListener('click', () => { modal.classList.add('hidden'); });
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.add('hidden'); });
}

// === 启动 ===
$('retry-btn').addEventListener('click', init);
document.addEventListener('DOMContentLoaded', () => { initSearch(); initUnit(); initTheme(); initMap(); init(); checkAuth(); });

// === 暗黑/浅色 ===
function initTheme() {
    const btn = $('theme-btn');
    let mode = localStorage.getItem('wx_theme') || 'dark';
    applyTheme(mode, btn);
    btn.addEventListener('click', () => {
        mode = mode === 'dark' ? 'light' : 'dark';
        localStorage.setItem('wx_theme', mode);
        applyTheme(mode, btn);
    });
}
function applyTheme(mode, btn) {
    const css = $('light-css');
    if (mode === 'light') { css.disabled = false; document.documentElement.classList.add('light-mode'); btn.textContent = '☀️'; }
    else { css.disabled = true; document.documentElement.classList.remove('light-mode'); btn.textContent = '🌙'; }
}
