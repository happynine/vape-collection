#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""根据 brands.json 的 name_cn（集团/公司字段）生成 data/groups.json"""
import json, os, collections

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
brands = json.load(open(os.path.join(BASE, 'data', 'brands.json'), encoding='utf-8'))

# 1. 去重：同名品牌保留 id 最小的一条
uniq = {}
for b in brands:
    key = (b.get('name_en') or '').strip().lower()
    if not key:
        continue
    if key not in uniq or (b.get('id') or 0) < (uniq[key].get('id') or 0):
        uniq[key] = b

# 2. name_cn 归一化：把同一集团的不同写法合并
NORMALIZE = {
    '卓尔悦': '聚为集团 JWEI',
    '依丽芙': '聚为集团 JWEI',
    '聚为集团': '聚为集团 JWEI',
    '吉迩': '吉迩科技 ICCPP',
    '思摩尔': '思摩尔国际 SMOORE',
    '斯科尔': '斯科尔科技 SKE',
    '爱奇迹': '爱奇迹 Heaven Gifts',
    '爱奇迹旗下': '爱奇迹 Heaven Gifts',
    '基克纳': '基克纳 Geekvape',
    '英美烟草': '英美烟草 BAT',
    '菲莫国际': '菲莫国际 PMI',
    '日本烟草': '日本烟草 JTI',
    '帝国烟草': '帝国烟草 Imperial Brands',
    '美国Sottera': '奥驰亚 Altria',
    '艾维普思': '艾维普思 IVPS',
    '汉清达': '汉清达 HQD',
    '拓伸': '拓伸 Topson',
    '道森': '道森 DS Vaping',
    '悦刻': '悦刻 RLX 雾芯科技',
    '优维尔': '优维尔 UWELL',
    '福摩特': '福摩特 Fumot',
    '派克斯创新': '派克斯创新 Hayati',
    '易佳特': '易佳特 Aspire',
    '新宜康': '新宜康 Innokin',
    '劳斯韦伯': '劳斯韦伯 Lost Vape',
    '大利万维': '大利万维 ALIBARBAR',
    '漫科斯威': '漫科斯威 Maskking',
    '康尔': '康尔 Kangertech',
    '合元': '合元集团',
    '你我集团': '你我集团 YouMe',
    '雁扬': '雁扬 YANYANG',
    '尊一品': '尊一品 ZUNYIPIN',
    '五轮': '五轮 WULUN',
    '卓力能': '卓力能 ALD',
    '爱乐米': '爱乐米 OXVA',
    '钥石': '钥石 Keystone',
    '质赢': '质赢 ZHIYING',
    '煜迎': '煜迎 YUYING',
    '赛尔美': '赛尔美 SAIERMEI',
    '艾蒂威肯': '艾蒂威肯 Advken',
    '大道四九': '大道四九',
}
# name_cn 为空但归属明确的品牌
MANUAL = {
    'lost mary': '爱奇迹 Heaven Gifts',
    'lost mary vape': '爱奇迹 Heaven Gifts',
    'heaven gifts': '爱奇迹 Heaven Gifts',
    'relx uk': '悦刻 RLX 雾芯科技',
    'relx vape': '悦刻 RLX 雾芯科技',
    'randm': '福摩特 Fumot',
    'supbliss': '福摩特 Fumot',
    'vome': '福摩特 Fumot',
    'fumot': '福摩特 Fumot',
    'quokka': '派克斯创新 Hayati',
    'vaalv': '聚为集团 JWEI',
    'vaal': '聚为集团 JWEI',
}
# 集团自身名字 / 重复命名的记录，不作为子品牌展示
SELF_BRAND = {'iccpp', 'heaven gifts'}
DROP_SUB = {'lost mary vape', 'relx uk', 'relx vape', 'vaalv', 'lana vape', 'lanavape vape'}

# 明显不是集团的占位值
DROP = {'', '官网有问题', '美国', '俄罗斯公司', '美国公司', '易佳特（网站有问题）'}

groups = collections.OrderedDict()
for b in uniq.values():
    cn = (b.get('name_cn') or '').strip()
    key = (b.get('name_en') or '').strip().lower()
    if key in SELF_BRAND or key in DROP_SUB:
        continue
    if key in MANUAL:
        groups.setdefault(MANUAL[key], []).append(b)
        continue
    if cn in DROP:
        continue
    name = NORMALIZE.get(cn, cn)
    groups.setdefault(name, []).append(b)

# 3. 只保留多品牌集团 + 明确单品牌但重要的公司
SINGLE_OK = {
    '悦刻 RLX 雾芯科技', '优维尔 UWELL', '大利万维 ALIBARBAR',
    '漫科斯威 Maskking', '新宜康 Innokin', '劳斯韦伯 Lost Vape',
    '帝国烟草 Imperial Brands', '奥驰亚 Altria', '派克斯创新 Hayati',
    '福摩特 Fumot', '易佳特 Aspire',
}
groups = {k: v for k, v in groups.items() if len(v) >= 2 or k in SINGLE_OK}

# 4. 集团简介与官网
DESC = {
    '英美烟草 BAT': ('全球第二大跨国烟草集团，雾化品牌 Vuse、尼古丁袋 Velo 与加热不燃烧 glo 构成新型烟草矩阵。', 'https://www.bat.com/'),
    '帝国烟草 Imperial Brands': ('英国跨国烟草集团，旗下 blu 为主力雾化品牌，Pulze 布局加热不燃烧。', 'https://www.imperialbrandsplc.com/'),
    '奥驰亚 Altria': ('美国最大烟草集团，2023 年完成对 NJOY 的全资收购，正式切入电子雾化赛道。', 'https://www.altria.com/'),
    '菲莫国际 PMI': ('全球最大烟草集团之一，IQOS 加热不燃烧、VEEV 雾化与 ZYN 尼古丁袋组成无烟产品矩阵。', 'https://www.pmi.com/'),
    '日本烟草 JTI': ('日本跨国烟草集团，Ploom 布局加热不燃烧，Logic 为其雾化品牌。', 'https://www.jti.com/'),
    '思摩尔国际 SMOORE': ('全球最大电子雾化设备制造商（HK:6969），FEELM 为陶瓷芯技术品牌，VAPORESSO 为自有消费品牌。', 'https://www.smooreholdings.com/'),
    '吉迩科技 ICCPP': ('深圳电子雾化集团，VOOPOO 主打开放式设备，ZOVOO / DRAGBAR 主打一次性产品。', 'https://www.iccpp.com/'),
    '基克纳 Geekvape': ('深圳雾化方案商，GEEKVAPE 主打开放式硬件，GEEKBAR 为其一次性品牌。', 'https://www.geekvape.com/'),
    '爱奇迹 Heaven Gifts': ('从贸易平台转型为品牌商，拥有 ELFBAR 与 LOST MARY 两大全球一次性雾化品牌。', 'https://www.heavengifts.com/'),
    '聚为集团 JWEI': ('2008 年成立的雾化集团，自有品牌包括 Joyetech、Eleaf、Wismec、VAAL。', 'https://www.jwei.com/'),
    '斯科尔科技 SKE': ('深圳斯科尔，SKE Crystal 系列为英国畅销一次性产品，另有 Sikary、MEMERS 等品牌。', 'https://www.sikaryofficial.com/'),
    '艾维普思 IVPS': ('SMOK 品牌母公司，产品覆盖主机、套装、雾化器及雾化芯全品类。', 'https://www.smoktech.com/'),
    '汉清达 HQD': ('深圳一次性雾化大厂，HQD 品牌覆盖全球 120 多个国家和地区。', 'https://hqdtech.com/'),
    '拓伸 Topson': ('东莞拓伸，ELUX（Legend / Firerose）品牌母公司，主打英国与欧洲市场。', 'https://www.eluxtech.com/'),
    '道森 DS Vaping': ('深圳道森，FLUM 品牌母公司，主打北美一次性市场。', 'https://flumgio.com/'),
    '福摩特 Fumot': ('深圳福摩特，RandM Tornado 系列母公司，另有 Supbliss、VOME 等品牌。', 'https://www.fumottech-global.com/'),
    '悦刻 RLX 雾芯科技': ('中国电子雾化品牌商（NYSE:RLX），RELX 悦刻为其核心品牌。', 'https://relxtech.com/'),
    '优维尔 UWELL': ('深圳优维尔，以严苛品控著称的开放式设备厂商，产品覆盖欧美与东南亚。', 'https://www.myuwell.com/'),
    '派克斯创新 Hayati': ('英国成长最快的雾化品牌之一，子品牌含 Quokka、Moxy、Liora、Finebar、Philia。', 'https://hayativapor.com/'),
    '易佳特 Aspire': ('深圳易佳特，Aspire 为全球知名开放式设备与雾化芯品牌。', 'https://www.aspirecig.com/'),
    '新宜康 Innokin': ('深圳新宜康，老牌开放式电子雾化设备厂商。', 'https://www.innokin.com/'),
    '劳斯韦伯 Lost Vape': ('深圳劳斯韦伯，主攻高端 DNA 芯片设备的开放式品牌。', 'https://lostvape.com/'),
    '大利万维 ALIBARBAR': ('面向澳洲市场的一次性雾化品牌运营商。', 'https://alibarbar.com/'),
    '漫科斯威 Maskking': ('北京起家的 OBM 厂商，一次性产品覆盖全球多个市场。', 'https://www.maskkingvape.com/'),
    '康尔 Kangertech': ('早期开放式电子雾化设备代表厂商，产品线覆盖入门套装与雾化器。', ''),
    '合元集团': ('深圳合元，电子雾化 ODM/OEM 大厂，自有品牌包括 BECO 等。', ''),
    '你我集团 YouMe': ('旗下拥有 Airbar、SUORIN、YouMe 等雾化品牌。', ''),
    '雁扬 YANYANG': ('旗下品牌 FLER、FLERBAR、HYPPE、TORCH。', ''),
    '尊一品 ZUNYIPIN': ('旗下品牌 KingZone、TESLACIGS、Vabeen、Ziggiys。', ''),
    '五轮 WULUN': ('旗下品牌 itsuwa、nextvapor、vapesoul。', ''),
    '卓力能 ALD': ('深圳卓力能，FRESOR 雾化技术平台，自有品牌 ADL、UPENDS。', ''),
    '爱乐米 OXVA': ('旗下 OXBAR 主攻一次性，OXVA 主打开放式设备。', ''),
    '钥石 Keystone': ('旗下品牌 KEYSTONE、NOVA。', ''),
    '质赢 ZHIYING': ('旗下品牌 QUAWINS、megabar。', ''),
    '煜迎 YUYING': ('旗下品牌 MIVIO、merrymi。', ''),
    '赛尔美 SAIERMEI': ('旗下品牌 Aloha Sun、smiss。', ''),
    '艾蒂威肯 Advken': ('旗下品牌 ASDF.、Advken。', ''),
    '大道四九': ('旗下品牌 Solobar、Vapengin。', ''),
}
# 集团 logo 取哪个子品牌
FLAGSHIP = {
    '英美烟草 BAT': 'VUSE', '帝国烟草 Imperial Brands': 'BLU', '奥驰亚 Altria': 'NJOY',
    '菲莫国际 PMI': 'IQOS', '日本烟草 JTI': 'PLOOM', '思摩尔国际 SMOORE': 'FEELM',
    '吉迩科技 ICCPP': 'VOOPOO', '基克纳 Geekvape': 'GEEKVAPE', '爱奇迹 Heaven Gifts': 'ELFBAR',
    '聚为集团 JWEI': 'Joyetech', '斯科尔科技 SKE': 'SKE', '艾维普思 IVPS': 'SMOK',
    '汉清达 HQD': 'HQD', '拓伸 Topson': 'ELUX', '道森 DS Vaping': 'FLUM',
    '福摩特 Fumot': 'fumot', '悦刻 RLX 雾芯科技': 'RELX', '优维尔 UWELL': 'UWELL',
    '派克斯创新 Hayati': 'HAYATI', '易佳特 Aspire': 'aspire', '新宜康 Innokin': 'INNOKIN',
    '劳斯韦伯 Lost Vape': 'Lost Vape', '大利万维 ALIBARBAR': 'ALIBARBAR',
    '漫科斯威 Maskking': 'maskking', '康尔 Kangertech': 'Kangertech', '合元集团': 'BECO',
    '你我集团 YouMe': 'YouMe', '卓力能 ALD': 'UPENDS', '爱乐米 OXVA': 'OXVA',
}

order = sorted(groups.items(), key=lambda kv: (-len(kv[1]), kv[0]))
out = []
gid = 1
for name, items in order:
    items = sorted(items, key=lambda x: (x.get('name_en') or '').lower())
    flag = FLAGSHIP.get(name)
    logo = ''
    for it in items:
        if flag and (it.get('name_en') or '').lower() == flag.lower():
            logo = it.get('logo') or ''
            break
    if not logo:
        for it in items:
            if it.get('logo'):
                logo = it['logo']
                break
    d, url = DESC.get(name, ('', ''))
    if not d:
        d = '旗下品牌：' + '、'.join(i.get('name_en') for i in items) + '。'
    if not url:
        url = next((i.get('url') for i in items if i.get('url')), '')
    out.append({
        'id': gid,
        'name': name,
        'desc': d,
        'url': url,
        'logo': logo,
        'sub_brands': [
            {'name': i.get('name_en'), 'url': i.get('url') or '', 'logo': i.get('logo') or ''}
            for i in items
        ],
    })
    gid += 1

dst = os.path.join(BASE, 'data', 'groups.json')
json.dump(out, open(dst, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
print('groups:', len(out), 'sub_brands total:', sum(len(g['sub_brands']) for g in out))
for g in out:
    print(' ', g['name'], '|', len(g['sub_brands']), '|', ', '.join(s['name'] for s in g['sub_brands']))
