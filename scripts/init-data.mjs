#!/usr/bin/env node
// ============================================================
// 一次性数据生成脚本：把本地数据转为 data/*.json
// 用法：
//   cd vape-collection
//   node supabase/init-data.mjs
//
// 生成：
//   data/brands.json   ← ../brands_data_1787019398910_0_qca6.json (807条)
//   data/shops.json    ← 内置 107 条默认商城
//   data/groups.json   ← 空数组
//
// 生成后需要手动 commit & push 到仓库：
//   git add data/
//   git commit -m "init: add cloud data"
//   git push
// ============================================================

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// ---------- 读取品牌数据 ----------
const brandsPath = path.join(ROOT, '..', 'brands_data_1787019398910_0_qca6.json');
if (!fs.existsSync(brandsPath)) {
  console.error('找不到品牌数据文件:', brandsPath);
  process.exit(1);
}
const brandsRaw = JSON.parse(fs.readFileSync(brandsPath, 'utf8'));
const brands = Object.values(brandsRaw).map(b => ({
  id: Number(b.id),
  name_en: b.name_en || '',
  name_cn: b.name_cn || '',
  url: b.url || '',
  region: b.region || '',
  level: b.level ?? 3,
  logo: b.logo || ''
}));
console.log(`官网品牌: ${brands.length} 条`);

// ---------- 默认商城（从原始 index.html 提取） ----------
const shops = [
  { id: 9001, name_en: 'Electric Tobacconist', name_cn: '', url: 'https://www.electrictobacconist.co.uk/', region: '英国', country: '英国', logo: '' },
  { id: 9002, name_en: 'Totally Wicked UK', name_cn: '', url: 'https://www.totallywicked-e-liquid.co.uk/', region: '英国', country: '英国', logo: '' },
  { id: 9003, name_en: 'E-Cigarette Direct', name_cn: '', url: 'https://www.ecigarettedirect.co.uk/', region: '英国', country: '英国', logo: '' },
  { id: 9004, name_en: 'Engångs vape', name_cn: '', url: 'https://vapea.se', region: '欧洲', country: '斯德哥尔摩-瑞典', logo: '' },
  { id: 9005, name_en: 'pyne pod-Vaping360', name_cn: '', url: 'https://vapesourcing.com', region: '美国', country: '美国', logo: '' },
  { id: 9006, name_en: 'ProVape', name_cn: '', url: 'https://provape.com/', region: '美国', country: '美国', logo: '' },
  { id: 9007, name_en: 'Red Star', name_cn: '', url: 'https://www.redstarvapor.com', region: '美国', country: '美国', logo: '' },
  { id: 9008, name_en: 'Vaping', name_cn: '', url: 'https://vaping.com', region: '美国', country: '美国', logo: '' },
  { id: 9009, name_en: 'VapeDeals360', name_cn: '', url: 'https://www.vapedeals360.com/', region: '美国', country: '美国', logo: '' },
  { id: 9010, name_en: 'EightVape', name_cn: '', url: 'https://eightvape.com', region: '美国全境', country: '垂直零售/美国内华达仓', logo: '' },
  { id: 9011, name_en: 'VaporDNA', name_cn: '', url: 'https://vapordna.com', region: '美国、部分国际地区', country: '老牌大厂零售/美国加州仓', logo: '' },
  { id: 9012, name_en: 'ECigMafia', name_cn: '', url: 'https://ecigmafia.com', region: '美国全境', country: '高流量折扣零售/美国仓', logo: '' },
  { id: 9013, name_en: 'Vape Society Supply', name_cn: '', url: 'https://vapesocietysupplies.com', region: '美国', country: '烟油及一次性专营/美国仓', logo: '' },
  { id: 9014, name_en: 'VaporFi', name_cn: '', url: 'https://vaporfi.com', region: '美国、加拿大', country: '零售/自有定制品牌商', logo: '' },
  { id: 9015, name_en: 'Element Vape', name_cn: '', url: 'https://elementvape.com', region: '美国全境', country: '全美最大流量独立站之一', logo: '' },
  { id: 9016, name_en: 'Direct Vapor', name_cn: '', url: 'https://directvapor.com', region: '美国', country: '一站式零售/免邮特色', logo: '' },
  { id: 9017, name_en: 'HealthCabin', name_cn: '', url: 'https://healthcabin.net', region: '全球 (辐射100+国家)', country: '老牌出海直邮独立站/中国仓', logo: '' },
  { id: 9018, name_en: '2FDeal', name_cn: '', url: 'https://2fdeal.com', region: '全球、欧洲、北美', country: '出海直邮及配件独立站/中国仓', logo: '' },
  { id: 9019, name_en: 'Vape Club', name_cn: '', url: 'https://vapeclub.co.uk', region: '英国、欧盟', country: '英国最大规模线上零售商', logo: '' },
  { id: 9020, name_en: 'Vapesuperstore', name_cn: '', url: 'https://vapesuperstore.co.uk', region: '英国、欧洲', country: '垂直零售/英国仓', logo: '' },
  { id: 9021, name_en: 'Evapo', name_cn: '', url: 'https://evapo.co.uk', region: '英国', country: '线上商城 + 连锁实体大店', logo: '' },
  { id: 9022, name_en: 'Vapourcore', name_cn: '', url: 'https://vapourcore.com', region: '英国、北欧', country: '高端电子烟零售/英国仓', logo: '' },
  { id: 9023, name_en: 'Flawless Vape Shop', name_cn: '', url: 'https://flawlessvapeshop.co.uk', region: '英国、欧洲', country: '批发兼零售巨头/英国仓', logo: '' },
  { id: 9024, name_en: 'Vapoholic', name_cn: '', url: 'https://vapoholic.co.uk', region: '英国、欧盟', country: '自产烟油与设备零售/英国', logo: '' },
  { id: 9025, name_en: 'JAC Vapour', name_cn: '', url: 'https://jacvapour.co.uk', region: '英国、欧洲', country: '英国自有品牌及渠道独立站', logo: '' },
  { id: 9026, name_en: 'VapoShop', name_cn: '', url: 'https://vaposhop.com', region: '欧洲全境、德国、荷兰', country: '专注干草及新型雾化/欧洲仓', logo: '' },
  { id: 9027, name_en: 'Le Petit Vapoteur', name_cn: '', url: 'https://lepetitvapoteur.com', region: '法国、欧洲全境', country: '法国及西欧流量最大的独立站', logo: '' },
  { id: 9028, name_en: 'Kumulus Vape', name_cn: '', url: 'https://kumulusvape.fr', region: '法国、南欧', country: '法国上市电子烟电商平台', logo: '' },
  { id: 9029, name_en: 'Cigamilano', name_cn: '', url: 'https://cigamilano.com', region: '意大利、南欧', country: '意大利本土主流线上零售商', logo: '' },
  { id: 9030, name_en: 'Vapeototal', name_cn: '', url: 'https://vapeototal.net', region: '西班牙、葡萄牙', country: '西班牙最大垂直电子烟网站', logo: '' },
  { id: 9031, name_en: 'Vape Direct Store', name_cn: '', url: 'https://vapedirectstore.com', region: '爱尔兰、英国', country: '英国及爱尔兰区域零售', logo: '' },
  { id: 9032, name_en: 'Vape King', name_cn: '', url: 'https://vapeking.com.au', region: '澳大利亚', country: '澳洲本土知名电子烟独立站', logo: '' },
  { id: 9033, name_en: 'Vapor Eyes', name_cn: '', url: 'https://vapingeyes.com.au', region: '澳洲、新西兰', country: '澳洲/新西兰大流量站点', logo: '' },
  { id: 9034, name_en: 'Vapo Australia', name_cn: '', url: 'https://vapoaustralia.com.au', region: '澳大利亚、大洋洲', country: '跨大洋洲知名零售品牌商', logo: '' },
  { id: 9035, name_en: 'PodVapes', name_cn: '', url: 'https://podvapes.com', region: '新西兰、智利、国际', country: '专注换弹式独立站', logo: '' },
  { id: 9036, name_en: 'Shosha', name_cn: '', url: 'https://shosha.co.nz', region: '新西兰', country: '新西兰最大线上线下一体独立站', logo: '' },
  { id: 9037, name_en: 'Vape Gate UAE', name_cn: '', url: 'https://vapegateuae.com', region: '阿联酋、中东', country: '中东主流电子烟及烟油独立站', logo: '' },
  { id: 9038, name_en: "Let's Vape", name_cn: '', url: 'https://letsvape.ae', region: '迪拜、海湾国家', country: '中东高消费群零售独立站', logo: '' },
  { id: 9039, name_en: 'Vape Joint', name_cn: '', url: 'https://vapejoint.co.za', region: '南非、非洲', country: '非洲南部高流量电子烟站点', logo: '' },
  { id: 9040, name_en: 'Vuse Official', name_cn: '', url: 'https://vuse.com', region: '全球（英、美、南非等）', country: '英美烟草旗下超级独立站', logo: '' },
  { id: 9041, name_en: 'Juul Labs', name_cn: '', url: 'https://juul.com', region: '全球、北美', country: 'JUUL官方全球线上零售站', logo: '' },
  { id: 9042, name_en: 'Relx Global', name_cn: '', url: 'https://relxnow.com', region: '东南亚、全球', country: '悦刻全球官方独立交易站', logo: '' },
  { id: 9043, name_en: 'Smokstore', name_cn: '', url: 'https://smokstore.com', region: '全球、欧美', country: 'SMOK品牌专营跨境零售站', logo: '' },
  { id: 9044, name_en: 'Geekvape Store', name_cn: '', url: 'https://store.geekvape.com', region: '全球', country: '吉尔官方直营线上跨境商城', logo: '' },
  { id: 9045, name_en: 'Voopoo Spark', name_cn: '', url: 'https://shop.voopoo.com', region: '全球', country: 'VOOPOO官方直营独立站', logo: '' },
  { id: 9046, name_en: 'Sourcemore', name_cn: '', url: 'https://sourcemore.com', region: '全球 (欧美为主)', country: '跨境低价硬件分销及零售站', logo: '' },
  { id: 9047, name_en: 'FastTech (Vape section)', name_cn: '', url: 'https://fasttech.com', region: '全球', country: '老牌综合出海3C及电子烟独立站', logo: '' },
  { id: 9048, name_en: 'Heaven Gifts', name_cn: '', url: 'https://heavengifts.com', region: '全球', country: '全球最大B2B电子烟批发平台', logo: '' },
  { id: 9049, name_en: 'Elegomall', name_cn: '', url: 'https://elegomall.com', region: '全球', country: '核心B2B电子烟跨境批发商城', logo: '' },
  { id: 9050, name_en: 'VaporWhale', name_cn: '', url: 'https://vaporwhale.com', region: '国际、拉美、东南亚', country: '跨境中转全球零售站', logo: '' },
  { id: 9051, name_en: 'Vape Juice Depot', name_cn: '', url: 'https://vapejuicedepot.com', region: '美国', country: '烟油大类垂直独立站', logo: '' },
  { id: 9052, name_en: 'MyVpro', name_cn: '', url: 'https://myvpro.com', region: '北美', country: '玩家级大功率硬件零售独立站', logo: '' },
  { id: 9053, name_en: 'Central Vapors', name_cn: '', url: 'https://centralvapors.com', region: '美国', country: '德州大宗液体及设备零售批发', logo: '' },
  { id: 9054, name_en: 'PerfectVape', name_cn: '', url: 'https://perfectvape.com', region: '美国、拉美', country: '大宗一次性低价线上批发零售站', logo: '' },
  { id: 9055, name_en: 'Wet Vapes', name_cn: '', url: 'https://wetvapes.com', region: '美国东部', country: '纽约及东海岸主流独立站', logo: '' },
  { id: 9056, name_en: 'Vape Wild (Legacy/Archive)', name_cn: '', url: 'https://vapewild.com', region: '北美 (现多大牌联营)', country: '知名高粘性电子烟社群电商', logo: '' },
  { id: 9057, name_en: 'Giant Vapes', name_cn: '', url: 'https://giantvapes.com', region: '美国', country: '专注高端美国制造烟油独立站', logo: '' },
  { id: 9058, name_en: 'Breazy', name_cn: '', url: 'https://breazy.com', region: '北美', country: '大型综合烟草及电子烟电商平台', logo: '' },
  { id: 9059, name_en: 'Ejuices.com', name_cn: '', url: 'https://ejuices.com', region: '全球、美国', country: '全球最大线上烟油分销独立站', logo: '' },
  { id: 9060, name_en: 'Vape Craft', name_cn: '', url: 'https://vapecraftinc.com', region: '美国', country: '平价烟油与自制调油电商', logo: '' },
  { id: 9061, name_en: 'Misthub', name_cn: '', url: 'https://misthub.com', region: '美国', country: '早期科技型电子烟零售独立站', logo: '' },
  { id: 9062, name_en: 'DashVapes', name_cn: '', url: 'https://dashvapes.com', region: '加拿大、欧洲', country: '加拿大最大电子烟垂直连锁电商', logo: '' },
  { id: 9063, name_en: '180 Smoke', name_cn: '', url: 'https://180smoke.ca', region: '加拿大', country: '加拿大本土高知名度电子烟独立站', logo: '' },
  { id: 9064, name_en: 'Vaporizers.ca', name_cn: '', url: 'https://vaporizers.ca', region: '加拿大', country: '专注于便携式雾化设备商城', logo: '' },
  { id: 9065, name_en: 'Ecigwizard', name_cn: '', url: 'https://ecigwizard.com', region: '英国、北欧', country: '英国老牌连销及线上交易商城', logo: '' },
  { id: 9066, name_en: 'Socialites Zero', name_cn: '', url: 'https://socialiteszero.com', region: '英国', country: '专注于新手入门级电子烟商城', logo: '' },
  { id: 9067, name_en: 'Gourmet E-Liquid', name_cn: '', url: 'https://gourmeteliquid.co.uk', region: '英国、西欧', country: '专注于高端沙龙级烟油线上商城', logo: '' },
  { id: 9068, name_en: 'Vape Mountain', name_cn: '', url: 'https://vapemountain.com', region: '英国、欧盟', country: '丰富的大功率及烟油库商城', logo: '' },
  { id: 9069, name_en: 'VapesStore UK', name_cn: '', url: 'https://vapesstore.co.uk', region: '英国', country: '一次性大口数英国垂直线上站', logo: '' },
  { id: 9070, name_en: 'Mr-Joy', name_cn: '', url: 'https://mr-joy.nl', region: '荷兰、比利时', country: '荷兰最具影响力的电子烟商城', logo: '' },
  { id: 9071, name_en: 'Dampfdorado', name_cn: '', url: 'https://dampfdorado.de', region: '德国、中欧', country: '德国本土流量第一的DIY烟油商城', logo: '' },
  { id: 9072, name_en: 'V those', name_cn: '', url: 'https://vapes.de', region: '德国', country: '德国主流硬件零售网站', logo: '' },
  { id: 9073, name_en: 'ZampleBox', name_cn: '', url: 'https://zamplebox.com', region: '美国、国际', country: '全球首家电子烟按月订阅盒商商城', logo: '' },
  { id: 9074, name_en: 'VaporFi AU', name_cn: '', url: 'https://vaporfi.com.au', region: '澳大利亚', country: 'VaporFi大洋洲独立分站', logo: '' },
  { id: 9075, name_en: 'Vaporium', name_cn: '', url: 'https://vaporium.fr', region: '法国', country: '法国高端植物基底烟油线上商城', logo: '' },
  { id: 9076, name_en: 'Taklope', name_cn: '', url: 'https://taklope.com', region: '法国、比利时', country: '法国极具代表性的硬件全线商城', logo: '' },
  { id: 9077, name_en: 'Vapormio', name_cn: '', url: 'https://vapormio.com', region: '意大利', country: '意大利新晋高增长零售站点', logo: '' },
  { id: 9078, name_en: 'Vaporoso', name_cn: '', url: 'https://vaporoso.it', region: '意大利', country: '意大利大宗烟油与小烟独立站', logo: '' },
  { id: 9079, name_en: 'Masquevapor', name_cn: '', url: 'https://masquevapor.com', region: '西班牙、拉美', country: '西班牙顶尖大功率DIY设备商城', logo: '' },
  { id: 9080, name_en: 'Vapeo24', name_cn: '', url: 'https://vapeo24.com', region: '西班牙', country: '西班牙24小时快速发货垂直站', logo: '' },
  { id: 9081, name_en: 'E-Cigarette.gr', name_cn: '', url: 'https://e-cigarette.gr', region: '希腊、东欧', country: '希腊本地化电子烟电商先驱', logo: '' },
  { id: 9082, name_en: 'Vape.se', name_cn: '', url: 'https://vape.se', region: '瑞典、北欧', country: '瑞典最大垂直电子烟零售商城', logo: '' },
  { id: 9083, name_en: 'Dampis', name_cn: '', url: 'https://dampis.se', region: '瑞典', country: '北欧风轻度雾化设备线上站', logo: '' },
  { id: 9084, name_en: 'FinnVape', name_cn: '', url: 'https://finnvape.com', region: '芬兰、爱沙尼亚', country: '辐射整个波罗的海的电子烟商城', logo: '' },
  { id: 9085, name_en: 'SmokeSmart', name_cn: '', url: 'https://smokesmart.de', region: '德国', country: '德语区无烟代用品及电子烟商城', logo: '' },
  { id: 9086, name_en: 'cigaret-electronique', name_cn: '', url: 'https://cigaret-electronique.fr', region: '法国', country: '法国经典普及型小烟垂直站', logo: '' },
  { id: 9087, name_en: 'Vape Store South Africa', name_cn: '', url: 'https://vapestore.co.za', region: '南非', country: '占领南非高端市场的垂直线上站', logo: '' },
  { id: 9088, name_en: 'Vape King RSA', name_cn: '', url: 'https://vapeking.co.za', region: '南非', country: '南非大宗批发兼零售综合站', logo: '' },
  { id: 9089, name_en: 'Vape Here India', name_cn: '', url: 'https://vapehere.in', region: '印度及南亚 (代购线)', country: '南亚流量较大的垂直展示与销售站', logo: '' },
  { id: 9090, name_en: 'Vape Zone UAE', name_cn: '', url: 'https://vapezoneuae.com', region: '阿联酋', country: '中东一次性爆款即时配送独立站', logo: '' },
  { id: 9091, name_en: 'Vape Monkey Dubai', name_cn: '', url: 'https://vapemonkeydubai.lv', region: '迪拜、沙特', country: '辐射中东阿联酋的轻奢线上站', logo: '' },
  { id: 9092, name_en: 'Saudi Vape Shop', name_cn: '', url: 'https://saudivapeshop.com', region: '沙特阿拉伯', country: '针对沙特本土物流优化的线上站', logo: '' },
  { id: 9093, name_en: 'Vape Egypt', name_cn: '', url: 'https://vapeegypt.com', region: '埃及、北非', country: '北非地区早期规模化电子烟商城', logo: '' },
  { id: 9094, name_en: 'Vape Indonesia', name_cn: '', url: 'https://indovaping.com', region: '印度尼西亚', country: '东南亚烟油消耗大国印尼线上站', logo: '' },
  { id: 9095, name_en: 'Vape Club Malaysia', name_cn: '', url: 'https://vapeclubmy.com', region: '马来西亚、东南亚', country: '马来西亚知名烟油出海综合商城', logo: '' },
  { id: 9096, name_en: 'Vape Singapore Line', name_cn: '', url: 'https://vapesg.co', region: '新加坡 (非公开/跨境)', country: '极具针对性的区域小烟零售线上站', logo: '' },
  { id: 9097, name_en: 'Vapor Mix Japan', name_cn: '', url: 'https://vapormix.jp', region: '日本 (符合当地法规)', country: '日本本土针对非尼古丁/加热不燃烧商城', logo: '' },
  { id: 9098, name_en: 'Vape Studio JP', name_cn: '', url: 'https://vapestudio.jp', region: '日本', country: '日本规模极大的实体联营线上商城', logo: '' },
  { id: 9099, name_en: 'Hiliq', name_cn: '', url: 'https://hiliq.com', region: '全球、日韩', country: '全球知名原料级及烟油跨境独立站', logo: '' },
  { id: 9100, name_en: 'Cigabuy', name_cn: '', url: 'https://cigabuy.com', region: '全球、欧洲', country: '早期主打极致性价比的跨境独立站', logo: '' },
  { id: 9101, name_en: 'TinyDeal (Vape Section)', name_cn: '', url: 'https://tinydeal.com', region: '国际、拉美', country: '跨境综合3C平台下的电子烟出海站', logo: '' },
  { id: 9102, name_en: 'Everzon', name_cn: '', url: 'https://everzon.com', region: '全球', country: '深圳顶级大宗电子烟B2B分销平台', logo: '' },
  { id: 9103, name_en: 'Ave40', name_cn: '', url: 'https://ave40.com', region: '全球', country: '电子烟跨境供应链直供批发商城', logo: '' },
  { id: 9104, name_en: '3FVape', name_cn: '', url: 'https://3fvape.com', region: '全球 (极客玩家)', country: '专注于高端客制化/配件跨境独立站', logo: '' },
  { id: 9105, name_en: 'BuyBest', name_cn: '', url: 'https://buybest.com', region: '全球', country: '专注于电子烟硬件及海外仓直邮站', logo: '' },
  { id: 9106, name_en: 'Vape.com', name_cn: '', url: 'https://vape.com', region: '北美', country: '黄金域名的美国本土老牌商城', logo: '' },
  { id: 9107, name_en: 'Ultimate Juice', name_cn: '', url: 'https://ultimatejuice.co.uk', region: '英国、欧洲', country: '专注于英国自产风味烟油直销商城', logo: '' }
];
console.log(`商城: ${shops.length} 条`);

// ---------- 集团：空 ----------
const groups = [];
console.log('集团: 0 条');

// ---------- 写入 data/ 目录 ----------
const dataDir = path.join(ROOT, 'data');
fs.mkdirSync(dataDir, { recursive: true });

fs.writeFileSync(path.join(dataDir, 'brands.json'), JSON.stringify(brands, null, 2));
fs.writeFileSync(path.join(dataDir, 'shops.json'),  JSON.stringify(shops,  null, 2));
fs.writeFileSync(path.join(dataDir, 'groups.json'), JSON.stringify(groups, null, 2));

const brandsSize = fs.statSync(path.join(dataDir, 'brands.json')).size;
const shopsSize  = fs.statSync(path.join(dataDir, 'shops.json')).size;
console.log(`\n✅ 数据文件已生成到 ${dataDir}/`);
console.log(`   brands.json  ${(brandsSize / 1024).toFixed(0)} KB`);
console.log(`   shops.json   ${(shopsSize / 1024).toFixed(0)} KB`);
console.log(`   groups.json  2 B`);
console.log(`\n下一步：提交并推送到 GitHub`);
console.log(`   git add data/`);
console.log(`   git commit -m "init: add cloud data files"`);
console.log(`   git push`);
