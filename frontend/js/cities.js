// ═══════════════════════════════════════════════════════════
//  本地城市数据库
// ═══════════════════════════════════════════════════════════
export let cityCache = null;
let cityLoad = null;
export const COUNTY = Object.create(null);

export async function loadCities() {
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
export const CITY_GUIDE = {
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

export function getCityGuide(name) {
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

export function findCity(lat, lon) {
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

export function resolveCity(loc) {
  if (loc.city && loc.city !== '当前位置' && !/^[A-Za-z]/.test(loc.city)) return loc.city;
  const cn = findCity(loc.lat, loc.lon);
  return cn || loc.city || '未知';
}

// Keep names and administrative regions from the same record. IP geolocation may
// provide an English city and a stale province while coordinates resolve locally.
export function normalizeLocation(loc) {
  const city = loc.city || loc.name || '当前位置';
  const clean = name => String(name || '').replace(/[市县区]$/, '');
  const region = loc.admin1 || loc.region || '';
  const matches = (cityCache || []).filter(row => clean(row.name) === clean(city));
  const named = matches.find(row => clean(row.admin1) === clean(region))
    || (matches.length === 1 ? matches[0] : null);
  let record = named;
  const resolved = resolveCity({ ...loc, city });
  if (!record && resolved !== city) {
    record = (cityCache || []).find(row => row.name === resolved);
  }
  return { ...loc, city: named ? city : resolved,
    region: record?.admin1 || region, country: loc.country || (record ? '中国' : '') };
}

export function regionLabel(region) {
  if (['河北', '山西', '辽宁', '吉林', '黑龙江', '江苏', '浙江', '安徽', '福建', '江西', '山东',
    '河南', '湖北', '湖南', '广东', '海南', '四川', '贵州', '云南', '陕西', '甘肃', '青海', '台湾'].includes(region)) return region + '省';
  return region;
}

export function toPrefectureCity(name) {
  if (!name) return name;
  let cleaned = name;
  for (const sf of ['市', '县', '区', '镇', '乡', '街道', '自治县', '自治州', '地区', '开发区', '新区', '特区', '县级市']) {
    if (cleaned.endsWith(sf)) { cleaned = cleaned.slice(0, -sf.length); break; }
  }
  if (COUNTY[cleaned]) return COUNTY[cleaned];
  if (COUNTY[name]) return COUNTY[name];
  return name.startsWith('市辖区') ? null : name;
}
