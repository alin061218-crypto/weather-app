// === 天气 App — 核心逻辑（v8 重设计） ===
import { Atmosphere } from './atmosphere.js';
import { icon, weatherIcon } from './icons.js';

const API_BASE = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
  ? 'http://localhost:3000' : '';

const $ = id => document.getElementById(id);
const Q = (sel, el) => (el || document).querySelector(sel);
const QA = (sel, el) => [...(el || document).querySelectorAll(sel)];

const API = {
  ip: 'https://ipapi.co/json/',
  geo: 'https://geocoding-api.open-meteo.com/v1/search',
  wx: 'https://api.open-meteo.com/v1/forecast'
};

const WX_PARAMS = 'current_weather=true&hourly=temperature_2m,weathercode,relativehumidity_2m,cloudcover,apparent_temperature,uv_index,precipitation_probability,pressure_msl,visibility&daily=temperature_2m_max,temperature_2m_min,weathercode,precipitation_probability_max,sunrise,sunset,uv_index_max&timezone=auto&forecast_hours=24&forecast_days=7';

let authToken = localStorage.getItem('wx_token') || '';
let currentUser = null;
let atmosphere = null;

let state = {
  city: null,
  weather: null,
  unit: localStorage.getItem('wx_unit') || 'celsius',
  chart: null,
  currentTab: 'home',
  theme: localStorage.getItem('wx_theme') || 'dark',
};

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
    const r = await fetch(url, { signal: ctrl.signal, headers, method: opts.method, body: opts.body });
    return await r.json();
  } catch { return null; }
  finally { clearTimeout(t); }
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
  return d2?.results?.map(r => ({ name: r.name || '', admin1: r.admin1 || '', country: r.country || '', lat: r.latitude, lon: r.longitude })) || [];
}

async function getWeather(lat, lon) {
  const d = await fetchJSON(`${API_BASE}/api/weather?lat=${lat}&lon=${lon}`, 10000);
  if (d && !d.error) return d;
  const d2 = await fetchJSON(`${API.wx}?latitude=${lat}&longitude=${lon}&${WX_PARAMS}`, 10000);
  if (!d2) throw new Error('天气数据获取失败');
  return d2;
}

// ═══════════════════════════════════════════════════════════
//  本地城市数据库
//  复用原有 DB + COUNTY（略，实际从原文件保留）
// ═══════════════════════════════════════════════════════════
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
// ... more cities from original
];

const COUNTY = {
'义乌':'金华','东阳':'金华','永康':'金华','慈溪':'宁波','余姚':'宁波','诸暨':'绍兴','海宁':'嘉兴','桐乡':'嘉兴',
'温岭':'台州','临海':'台州','乐清':'温州','瑞安':'温州','建德':'杭州','富阳':'杭州','临安':'杭州',
'江阴':'无锡','宜兴':'无锡','昆山':'苏州','常熟':'苏州','张家港':'苏州','太仓':'苏州',
'丹阳':'镇江','句容':'镇江','溧阳':'常州','金坛':'常州','如皋':'南通','海门':'南通','启东':'南通',
'兴化':'泰州','靖江':'泰州','泰兴':'泰州','东台':'盐城','大丰':'盐城','新沂':'徐州','邳州':'徐州',
'仪征':'扬州','高邮':'扬州','盱眙':'淮安','洪泽':'淮安','沭阳':'宿迁','东海':'连云港','赣榆':'连云港','灌云':'连云港','灌南':'连云港',
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
// ... more
};

// 补充区县到 DB
for (const cn of Object.keys(COUNTY)) {
  const pn = COUNTY[cn];
  const p = DB.find(c => c && c.length >= 4 && c[0] === pn);
  if (p && !DB.some(c => c && c[0] === cn)) {
    if (typeof p[2] === 'number' && typeof p[3] === 'number') {
      DB.push([cn, p[1], p[2] + (Math.random() - 0.5) * 0.02, p[3] + (Math.random() - 0.5) * 0.02]);
    }
  }
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
  for (const entry of DB) {
    const [n, p, clat, clon] = entry;
    if (typeof clat !== 'number' || typeof clon !== 'number' || isNaN(clat) || isNaN(clon)) continue;
    const d = (clat - lat) ** 2 + (clon - lon) ** 2;
    if (d < bestD) { bestD = d; best = n; }
  }
  const raw = bestD < 0.5 ? best : null;
  if (raw && COUNTY[raw]) return COUNTY[raw];
  return raw;
}

function searchLocal(q) {
  let s = q;
  for (const sf of ['自治县', '自治州', '县级市', '开发区', '新区', '特区', '地区', '街道', '市', '县', '区', '镇', '乡']) {
    if (s.endsWith(sf)) { s = s.slice(0, -sf.length); break; }
  }
  s = s.toLowerCase().trim();
  if (s.length < 2) return [];
  const scored = [];
  for (const [n, p, lat, lon] of DB) {
    const nl = n.toLowerCase();
    let sc = 0;
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

async function doSearch(query) {
  const NOT_CITY = /(机场|航空|车站|高铁|服务区|收费站|隧道|大桥|加油|停车|公墓|陵园)/;
  const nameOK = n => n && !NOT_CITY.test(n) && n.length >= 2;
  const local = searchLocal(query);
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
  $('region').textContent = [loc.region || loc.admin1, loc.country].filter(Boolean).join('，') || '';

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
      `<div class="stat-chip"><span class="stat-chip-icon">${ico}</span><div><span class="stat-chip-label">${label}</span><span class="stat-chip-value">${value}</span></div></div>`
    ).join('');
  }

  // 7天预报（列表式新设计）
  const dailyList = $('daily-list');
  if (dailyList && d?.time) {
    const allTemps = [...(d.temperature_2m_max || []), ...(d.temperature_2m_min || [])];
    const globalMin = Math.min(...allTemps);
    const globalMax = Math.max(...allTemps);
    const range = globalMax - globalMin || 1;

    dailyList.innerHTML = '';
    for (let i = 0; i < d.time.length; i++) {
      const lo = d.temperature_2m_min[i];
      const hi = d.temperature_2m_max[i];
      const precip = d.precipitation_probability_max?.[i] || 0;
      const barLeft = ((lo - globalMin) / range * 100).toFixed(0);
      const barRight = ((globalMax - hi) / range * 100).toFixed(0);

      const dayDiv = document.createElement('div');
      dayDiv.className = 'day-row';
      dayDiv.innerHTML = `
        <span class="day-name">${F.day(d.time[i])}</span>
        <span class="day-icon-wrap">${weatherIcon(d.weathercode[i], true)}</span>
        <div class="day-temp-range">
          <span class="day-temp-lo">${F.ftemp(lo, state.unit)}</span>
          <div class="day-temp-bar"><div class="day-temp-fill" style="--bar-left:${barLeft}%;--bar-right:${barRight}%"></div></div>
          <span class="day-temp-hi">${F.ftemp(hi, state.unit)}</span>
        </div>
        ${precip > 0 ? `<span class="day-precip">${precip}%</span>` : '<span class="day-precip"></span>'}
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

    // 背景网格
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= 4; i++) {
      const y = pad.t + (ph / 4) * i;
      const val = max - (range / 4) * i;
      ctx.beginPath();
      ctx.moveTo(pad.l, y);
      ctx.lineTo(pad.l + pw, y);
      ctx.stroke();

      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.font = '10px system-ui, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(F.ftemp(Math.round(val), this.unit), pad.l - 6, y + 4);
    }

    // 时间标签
    const step = Math.max(1, Math.floor(temps.length / 6));
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.font = '10px system-ui, sans-serif';
    for (let i = 0; i < temps.length; i += step) {
      ctx.fillText(F.time(time[i]), xf(i), pad.t + ph + 15);
    }

    // 面积填充（使用设计令牌色）
    const grad = ctx.createLinearGradient(0, pad.t, 0, pad.t + ph);
    grad.addColorStop(0, 'oklch(0.58 0.08 170 / 0.25)');
    grad.addColorStop(1, 'oklch(0.58 0.08 170 / 0)');

    ctx.beginPath();
    ctx.moveTo(xf(0), yf(temps[0]));
    for (let i = 1; i < temps.length; i++) {
      const xc = (xf(i - 1) + xf(i)) / 2;
      ctx.bezierCurveTo(xc, yf(temps[i - 1]), xc, yf(temps[i]), xf(i), yf(temps[i]));
    }
    ctx.lineTo(xf(temps.length - 1), pad.t + ph);
    ctx.lineTo(xf(0), pad.t + ph);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // 线条
    ctx.beginPath();
    ctx.moveTo(xf(0), yf(temps[0]));
    for (let i = 1; i < temps.length; i++) {
      const xc = (xf(i - 1) + xf(i)) / 2;
      ctx.bezierCurveTo(xc, yf(temps[i - 1]), xc, yf(temps[i]), xf(i), yf(temps[i]));
    }
    ctx.strokeStyle = 'oklch(0.58 0.08 170 / 0.7)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // 数据点
    for (let i = 0; i < temps.length; i++) {
      ctx.beginPath();
      ctx.arc(xf(i), yf(temps[i]), 2.5, 0, Math.PI * 2);
      ctx.fillStyle = 'oklch(0.58 0.08 170 / 0.9)';
      ctx.fill();
    }
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
  let loc = null;
  toggle('loading');

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

  // 2. IP 兜底
  if (!loc) {
    try {
      const d = await fetchJSON(`${API_BASE}/api/location`, 6000);
      if (d && d.city && !d.error && d.country !== 'United States' && d.country !== 'US') {
        const cn = toPrefectureCity(d.city);
        loc = { city: cn || d.city, region: d.region || '', country: d.country || '', lat: d.lat, lon: d.lon };
      }
    } catch {}
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

  // 3. 北京兜底
  if (!loc) loc = { city: '北京', region: '', country: '中国', lat: 39.904, lon: 116.407 };

  try {
    const wx = await getWeather(loc.lat, loc.lon);
    state.city = loc;
    state.weather = wx;
    localStorage.setItem('wx_last', JSON.stringify({ loc, wx, ts: Date.now() }));
    renderWeather(loc, wx);
  } catch (e) {
    const raw = localStorage.getItem('wx_last');
    if (raw) {
      const c = JSON.parse(raw);
      renderWeather(c.loc, c.wx);
      $('error-msg').textContent = '显示缓存数据';
      toggle('weather-card');
    } else {
      $('error-msg').textContent = e.message;
      toggle('error-card');
    }
  }
}

function initSearch() {
  const inp = $('search-input');
  const clr = $('search-clear');
  const res = $('search-results');
  const recentEl = $('recent-list');
  const rsec = $('recent-section');
  let last = [];

  const search = F.debounce(async q => {
    if (q.length < 2) { res.classList.add('hidden'); last = []; return; }
    last = await doSearch(q);
    res.innerHTML = '';
    res.classList.remove('hidden');
    if (!last.length) { res.classList.add('hidden'); return; }
    for (const c of last) {
      const li = document.createElement('li');
      li.className = 'search-item';
      li.innerHTML = `<span class="si-name">${c.name}</span><span class="si-meta">${[c.admin1, c.country].filter(Boolean).join('，')}</span>`;
      li.addEventListener('click', () => { selectCity(c); res.classList.add('hidden'); });
      res.appendChild(li);
    }
  }, 250);

  inp.addEventListener('input', () => {
    clr.classList.toggle('hidden', !inp.value);
    search(inp.value.trim());
  });

  inp.addEventListener('keydown', async e => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const q = inp.value.trim();
    if (!q) return;
    if (last.length) { selectCity(last[0]); res.classList.add('hidden'); }
    else { const r = await doSearch(q); if (r.length) selectCity(r[0]); }
  });

  clr.addEventListener('click', () => {
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
    recentEl.innerHTML = rc.map(c => `<span class="recent-chip">${c.name}</span>`).join('');
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
  const inp = $('search-input');
  inp.value = c.name;
  $('search-clear').classList.remove('hidden');

  try {
    const recent = JSON.parse(localStorage.getItem('wx_recent') || '[]');
    const filtered = recent.filter(x => !(Math.abs(x.lat - c.lat) < 0.01 && Math.abs(x.lon - c.lon) < 0.01));
    filtered.unshift({ name: c.name, admin1: c.admin1, country: c.country, lat: c.lat, lon: c.lon });
    localStorage.setItem('wx_recent', JSON.stringify(filtered.slice(0, 5)));
  } catch {}

  const loc = { city: c.name, region: c.admin1 || '', country: c.country || '', lat: c.lat, lon: c.lon };
  try {
    const wx = await getWeather(c.lat, c.lon);
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
      if (d && d.user) { currentUser = d.user; updateMeUI(); }
    }).catch(() => { logout(); });
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
  if (!currentUser) { list.innerHTML = '<p class="me-empty">请先登录</p>'; return; }
  const d = await fetchJSON(`${API_BASE}/api/favorites`);
  if (!d || d.error) { list.innerHTML = '<p class="me-empty">加载失败</p>'; return; }
  if (!d.length) { list.innerHTML = '<p class="me-empty">暂无收藏，在天气页搜索城市后点击星标收藏</p>'; return; }
  list.innerHTML = d.map(f => `<div class="fav-item"><div class="fav-item-click" data-lat="${f.lat}" data-lon="${f.lon}" data-name="${f.name}" data-admin1="${f.admin1||''}" data-country="${f.country||''}"><div class="fav-item-name">${f.name}</div><div class="fav-item-meta">${f.admin1||''} ${f.country||''}</div></div><button class="fav-item-del" data-id="${f.id}">&times;</button></div>`).join('');
  QA('.fav-item-click', list).forEach(el => {
    el.addEventListener('click', () => {
      selectCity({ name: el.dataset.name, admin1: el.dataset.admin1, country: el.dataset.country, lat: parseFloat(el.dataset.lat), lon: parseFloat(el.dataset.lon) });
      switchTab('home');
    });
  });
  QA('.fav-item-del', list).forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await fetchJSON(`${API_BASE}/api/favorites/${btn.dataset.id}`, 3000, { method: 'DELETE' });
      loadMeFavorites();
      updateStarUI();
    });
  });
}

async function loadMeHistory() {
  const list = $('me-hist-list');
  if (!currentUser) { list.innerHTML = '<p class="me-empty">请先登录</p>'; return; }
  const d = await fetchJSON(`${API_BASE}/api/history`);
  if (!d || d.error) { list.innerHTML = '<p class="me-empty">加载失败</p>'; return; }
  if (!d.length) { list.innerHTML = '<p class="me-empty">暂无记录</p>'; return; }
  list.innerHTML = d.map(h => `<div class="fav-item" style="cursor:pointer"><div class="fav-item-click" data-lat="${h.lat}" data-lon="${h.lon}" data-name="${h.city}"><div class="fav-item-name">${h.city}</div><div class="fav-item-meta">${h.weather||''} · ${new Date(h.time).toLocaleString()}</div></div></div>`).join('');
  QA('.fav-item-click', list).forEach(el => {
    el.addEventListener('click', () => {
      selectCity({ name: el.dataset.name, lat: parseFloat(el.dataset.lat), lon: parseFloat(el.dataset.lon) });
      switchTab('home');
    });
  });
}

// 收藏星标
function addFavButton(loc) {
  const btn = $('fav-btn');
  if (!btn) return;

  btn.classList.remove('active');
  btn.querySelector('svg').style.fill = 'none';

  btn.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (!currentUser) { switchTab('me'); return; }
    if (btn.classList.contains('active')) {
      const d = await fetchJSON(`${API_BASE}/api/favorites`);
      if (d) {
        const fav = d.find(f => Math.abs(f.lat - loc.lat) < 0.01 && Math.abs(f.lon - loc.lon) < 0.01);
        if (fav) {
          await fetchJSON(`${API_BASE}/api/favorites/${fav.id}`, 3000, { method: 'DELETE' });
          btn.classList.remove('active');
        }
      }
    } else {
      const d = await fetchJSON(`${API_BASE}/api/favorites`, 3000, {
        method: 'POST',
        body: JSON.stringify({ name: loc.city || loc.name, admin1: loc.region || loc.admin1 || '', country: loc.country || '', lat: loc.lat, lon: loc.lon })
      });
      if (d && !d.error) btn.classList.add('active');
    }
    loadMeFavorites();
  });

  if (currentUser) {
    fetchJSON(`${API_BASE}/api/favorites`).then(d => {
      if (d && d.find(f => Math.abs(f.lat - loc.lat) < 0.01 && Math.abs(f.lon - loc.lon) < 0.01)) {
        btn.classList.add('active');
      }
    });
  }
}

function updateStarUI() {
  const btn = $('fav-btn');
  if (!btn || !state.city) return;
  if (!currentUser) { btn.classList.remove('active'); return; }
  fetchJSON(`${API_BASE}/api/favorites`).then(d => {
    if (d && d.find(f => Math.abs(f.lat - state.city.lat) < 0.01 && Math.abs(f.lon - state.city.lon) < 0.01)) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
}

// 拦截 renderWeather 加收藏按钮
const _origRW = renderWeather;
renderWeather = function (loc, wx) {
  _origRW(loc, wx);
  if (loc.lat && loc.lon) addFavButton(loc);
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
    div.innerHTML = `<div class="chat-avatar">${avatarIcon}</div><div class="chat-text">${text.replace(/\n/g, '<br>')}</div>`;
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
    const lat = state.city?.lat || 39.9;
    const lon = state.city?.lon || 116.4;
    const url = `https://embed.windy.com/embed.html?type=map&location=coordinates&metricRain=mm&metricTemp=°C&metricWind=km/h&zoom=7&overlay=wind&product=ecmwf&lat=${lat}&lon=${lon}&detailLat=${lat}&detailLon=${lon}&detail=true&message=true`;
    if (frame.src !== url && !frame.src.includes('windy')) { frame.src = url; }
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
