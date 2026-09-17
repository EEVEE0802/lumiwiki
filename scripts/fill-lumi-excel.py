"""
把对内版噜咪信息填入 docs/噜咪立绘与技能资料.xlsx

每种语言一个 sheet，共 5 个 sheet：
  简体中文 / 繁體中文 / English / 日本語 / 한국어

每个 sheet 独立完整：1 表头 + 194 只噜咪各占 1 行，图片完整嵌入
"""
import json
import re
import sys
from pathlib import Path

import openpyxl
from openpyxl.drawing.image import Image
from openpyxl.styles import Alignment, Font
from openpyxl.utils import get_column_letter

sys.stdout.reconfigure(encoding='utf-8')

# ============ 路径配置 ============
INTERNAL_DATA = Path('F:/G36Branch/Designer/Config/Luban/Datas/check/data')
WIKI_ROOT = Path('D:/lumiwiki')
XLSX_PATH = WIKI_ROOT / 'docs' / '噜咪立绘与技能资料.xlsx'
XLSX_BAK = WIKI_ROOT / 'docs' / '噜咪立绘与技能资料.xlsx.bak'  # 表头模板来源
AVATAR_DIR = WIKI_ROOT / 'public' / 'images' / 'avatars'
SKILL_ICON_DIR = WIKI_ROOT / 'public' / 'images' / 'skills'

# ============ 语言 / sheet 映射 ============
# (lang_code, sheet_name, multilingual_file)
LANGUAGES = [
    ('zh-CN', '简体中文', 'MultilingualCN.json'),
    ('zh-TW', '繁體中文', 'MultilingualTR.json'),  # TR = Traditional
    ('en',    'English', 'MultilingualEN.json'),
    ('ja',    '日本語',  'MultilingualJP.json'),
    ('ko',    '한국어',  'MultilingualKR.json'),
]

IMG_SIZE = 80  # 图片显示尺寸（像素）


def load_json(path):
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)


def to_map(list_data, key='Id'):
    return {item[key]: item for item in list_data}


def load_locmap(filename):
    """MultilingualXX.json 是 list of {Id, Data}"""
    data = load_json(INTERNAL_DATA / filename)
    return {item['Id']: item['Data'] for item in data}


def resolve_text(key, locmap):
    """按 key 查多语言；查不到留原 key（用户要求）"""
    if not key:
        return ''
    return locmap.get(key, key)


def process_desc(des_key, des_param, locmap):
    """
    复刻 wiki useBattleText.replacePlaceholders 的纯文本版：
      1. 按 des_key 查多语言
      2. [xxx] 多语言嵌套引用
      3. {N} 参数替换
      4. <link=N><color=xxx>文字</color></link> → 只保留文字
      5. <color=xxx>...</color> → 只保留文字
      6. 残留 <link>/</link>
    """
    if not des_key:
        return ''
    text = locmap.get(des_key, des_key)

    def sub_bracket(m):
        return locmap.get(m.group(1), m.group(1))
    for _ in range(3):
        new_text = re.sub(r'\[([^\]]+)\]', sub_bracket, text)
        if new_text == text:
            break
        text = new_text

    if des_param:
        def sub_param(m):
            idx = int(m.group(1))
            if idx < len(des_param):
                return str(des_param[idx])
            return m.group(0)
        text = re.sub(r'\{(\d+)\}', sub_param, text)

    text = re.sub(r'<link=\d+>\s*<color=[^>]+>\s*([^<]+?)\s*</color>\s*</link>', r'\1', text, flags=re.IGNORECASE)
    text = re.sub(r'<color=[^>]+>', '', text, flags=re.IGNORECASE)
    text = re.sub(r'</color>', '', text, flags=re.IGNORECASE)
    text = re.sub(r'</?link=?\d*>', '', text, flags=re.IGNORECASE)
    return text.strip()


def add_image(ws, cell, img_path):
    if not img_path.exists():
        return False
    try:
        img = Image(str(img_path))
        img.width = IMG_SIZE
        img.height = IMG_SIZE
        img.anchor = cell
        ws.add_image(img)
        return True
    except Exception as e:
        print(f'  [warn] 加图失败 {img_path}: {e}')
        return False


# ============ 列布局 ============
# 表头从备份 xlsx 读取（保留原 28 列表头）
COL = {
    'name': 1, 'ca': 2,
    'trait_name': 3, 'trait_des': 4, 'trait_icon': 5,
    'exc_name': 6, 'exc_des': 7, 'exc_icon': 8,
    's1_name': 9,  's1_des': 10, 's1_icon': 11,
    's2_name': 12, 's2_des': 13, 's2_icon': 14,
    's3_name': 15, 's3_des': 16, 's3_icon': 17,
    's4_name': 18, 's4_des': 19, 's4_icon': 20,
    's5_name': 21, 's5_des': 22, 's5_icon': 23,
    's6_name': 24, 's6_icon': 25,
    # 技能 7 (26-28) 留空
}
# 技能池 6 个：Pool1[0], Pool1[1], Pool2[0], Pool2[1], Pool3[0], Pool3[1]
POOL_SLOTS = [(1, 0), (1, 1), (2, 0), (2, 1), (3, 0), (3, 1)]

# 列宽
COL_WIDTHS = {
    'name': 18, 'ca': 14,
    'trait_name': 18, 'trait_des': 45, 'trait_icon': 14,
    'exc_name': 18, 'exc_des': 45, 'exc_icon': 14,
    's6_name': 18, 's6_icon': 14,
}
for slot in range(1, 6):
    COL_WIDTHS[f's{slot}_name'] = 18
    COL_WIDTHS[f's{slot}_des'] = 45
    COL_WIDTHS[f's{slot}_icon'] = 14


HEADER = [
    '噜咪名称', '噜咪立绘',
    '特性', '特性描述', '特性icon',
    '专属技能名称', '专属技能描述', '专属技能icon',
    '技能1名称', '技能1描述', '技能1icon',
    '技能2名称', '技能2描述', '技能2icon',
    '技能3名称', '技能3描述', '技能3icon',
    '技能4名称', '技能4描述', '技能4icon',
    '技能5名称', '技能5描述', '技能5icon',
    '技能6名称', '技能6icon',
    '技能7名称', '技能7描述', '技能7icon',
]


def build_sheet(ws, header, lumis, active_map, battle_p_map, home_p_map, locmap):
    """为单个语言 sheet 填数据"""
    center = Alignment(horizontal='center', vertical='center')
    wrap = Alignment(wrap_text=True, vertical='center', horizontal='left')

    # 表头
    for c, val in enumerate(header, start=1):
        cell = ws.cell(row=1, column=c, value=val)
        cell.alignment = center
        cell.font = Font(bold=True)
    ws.row_dimensions[1].height = 24
    ws.freeze_panes = 'A2'

    missing_ca, missing_icon = [], []
    row = 2
    for lumi in lumis:
        lumi_id = lumi['Id']

        # 特性（Battle 或 Home 二选一）
        bp_id = lumi.get('BattlePassive') or 0
        hp_id = lumi.get('HomePassive') or 0
        if bp_id and bp_id in battle_p_map:
            trait = battle_p_map[bp_id]
        elif hp_id and hp_id in home_p_map:
            trait = home_p_map[hp_id]
        else:
            trait = None

        exc = active_map.get(lumi.get('ActiveSkill') or 0)

        pool_skills = []
        for pool_idx, slot_idx in POOL_SLOTS:
            pool = lumi.get(f'SkillPool{pool_idx}') or []
            sid = pool[slot_idx] if slot_idx < len(pool) else 0
            pool_skills.append(active_map.get(sid) if sid else None)

        # 文字
        ws.cell(row=row, column=COL['name'], value=resolve_text(lumi.get('Name'), locmap)).alignment = wrap
        if trait:
            ws.cell(row=row, column=COL['trait_name'], value=resolve_text(trait.get('name'), locmap)).alignment = wrap
            ws.cell(row=row, column=COL['trait_des'],
                    value=process_desc(trait.get('Des'), trait.get('DesParam'), locmap)).alignment = wrap
        if exc:
            ws.cell(row=row, column=COL['exc_name'], value=resolve_text(exc.get('name'), locmap)).alignment = wrap
            ws.cell(row=row, column=COL['exc_des'],
                    value=process_desc(exc.get('Des'), exc.get('DesParam'), locmap)).alignment = wrap
        for idx, sk in enumerate(pool_skills):
            slot = idx + 1
            if sk:
                ws.cell(row=row, column=COL[f's{slot}_name'],
                        value=resolve_text(sk.get('name'), locmap)).alignment = wrap
                if slot != 6:
                    ws.cell(row=row, column=COL[f's{slot}_des'],
                            value=process_desc(sk.get('Des'), sk.get('DesParam'), locmap)).alignment = wrap

        # 图片（每行都放）
        ca_path = AVATAR_DIR / f'CA_{lumi_id}.png'
        if not add_image(ws, f'{get_column_letter(COL["ca"])}{row}', ca_path):
            missing_ca.append(lumi_id)
        if trait and trait.get('icon'):
            p = SKILL_ICON_DIR / f'{trait["icon"]}.png'
            if not add_image(ws, f'{get_column_letter(COL["trait_icon"])}{row}', p):
                missing_icon.append(('trait', lumi_id, trait['icon']))
        if exc and exc.get('icon'):
            p = SKILL_ICON_DIR / f'{exc["icon"]}.png'
            if not add_image(ws, f'{get_column_letter(COL["exc_icon"])}{row}', p):
                missing_icon.append(('exc', lumi_id, exc['icon']))
        for idx, sk in enumerate(pool_skills):
            slot = idx + 1
            if sk and sk.get('icon'):
                p = SKILL_ICON_DIR / f'{sk["icon"]}.png'
                if not add_image(ws, f'{get_column_letter(COL[f"s{slot}_icon"])}{row}', p):
                    missing_icon.append((f's{slot}', lumi_id, sk['icon']))

        ws.row_dimensions[row].height = 65
        row += 1

    # 列宽
    for key, w in COL_WIDTHS.items():
        ws.column_dimensions[get_column_letter(COL[key])].width = w

    return missing_ca, missing_icon


def main():
    print('加载对内版数据...')
    lumis_all = load_json(INTERNAL_DATA / 'Lumi.json')
    lumis = [l for l in lumis_all if not l.get('IfLock')]
    lumis.sort(key=lambda x: (x.get('PokedexId', 99999), x.get('Id')))
    print(f'  噜咪 IfLock=false: {len(lumis)}')

    active_map = to_map(load_json(INTERNAL_DATA / 'ActiveSkill.json'))
    battle_p_map = to_map(load_json(INTERNAL_DATA / 'BattlePassive.json'))
    home_p_map = to_map(load_json(INTERNAL_DATA / 'HomePassive.json'))
    print(f'  ActiveSkill: {len(active_map)}, BattlePassive: {len(battle_p_map)}, HomePassive: {len(home_p_map)}')

    header = HEADER
    print(f'  使用内置表头 ({len(header)} 列): {header[:3]}...')

    # 加载 5 语言映射
    locmaps = {}
    for lang, _, fn in LANGUAGES:
        locmaps[lang] = load_locmap(fn)
    print(f'  多语言加载完成: {[(l, len(v)) for l, v in locmaps.items()]}')

    # 全新 workbook（不再基于原 xlsx，避免残留 sheet）
    wb = openpyxl.Workbook()
    # 移除默认空 sheet
    wb.remove(wb.active)

    all_missing_ca = {}
    all_missing_icon = {}

    for lang, sheet_name, _ in LANGUAGES:
        print(f'\n=== 生成 sheet「{sheet_name}」({lang}) ===')
        ws = wb.create_sheet(title=sheet_name)
        miss_ca, miss_icon = build_sheet(
            ws, header, lumis, active_map, battle_p_map, home_p_map, locmaps[lang]
        )
        all_missing_ca[lang] = miss_ca
        all_missing_icon[lang] = miss_icon
        print(f'  完成：{len(lumis)} 行 + 图片，立绘缺失 {len(miss_ca)}，icon 缺失 {len(miss_icon)}')

    print(f'\n保存 xlsx...')
    wb.save(XLSX_PATH)
    size_mb = XLSX_PATH.stat().st_size / 1024 / 1024
    print(f'  → {XLSX_PATH} ({size_mb:.1f} MB)')

    # 缺失报告（各 sheet 应该一致）
    print(f'\n=== 素材缺失（以简体中文 sheet 为准） ===')
    print(f'立绘缺失（{len(all_missing_ca["zh-CN"])}）: {all_missing_ca["zh-CN"][:10]}')
    icon_by_type = {}
    for t, lid, icon in all_missing_icon['zh-CN']:
        icon_by_type.setdefault(icon, []).append((t, lid))
    for icon, items in sorted(icon_by_type.items()):
        print(f'  {icon} 缺失 {len(items)} 处: {items[:3]}{"..." if len(items) > 3 else ""}')


if __name__ == '__main__':
    main()
