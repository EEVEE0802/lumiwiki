# -*- coding: utf-8 -*-
"""
生成 D:/Lumi信息汇总.xlsx
- 数据源：public/data/internal/（对内版）
- 类型顺序：普通 → 异色卡 → 次元卡 → 王 → 幻境卡
- 内部排序：PokedexId 升序
- 进化链合并到一行（含分支进化）
- 立绘：public/images/avatars/CA_<Id>.png
- 三视图：D:/噜咪模型/Char_<Model>.(png|jpg)
"""
import json
import os
import sys
import io
import shutil

# 强制 stdout 用 utf-8，避免 Windows GBK 撞车
if sys.stdout.encoding and sys.stdout.encoding.lower() != 'utf-8':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

from openpyxl import Workbook
from openpyxl.drawing.image import Image as XLImage
from openpyxl.utils import get_column_letter
from openpyxl.styles import Alignment, Font, PatternFill, Border, Side
from PIL import Image as PILImage
import tempfile

# ---- 路径 ----
DATA_DIR = 'D:/lumiwiki/public/data/internal'
AVATAR_DIR = 'D:/lumiwiki/public/images/avatars'
MODEL_DIR = 'D:/噜咪模型'
OUTPUT = 'D:/Lumi信息汇总.xlsx'

IMG_SIZE = 100                  # 立绘正方形尺寸（像素）
ROW_HEIGHT_PT_BASE = 80         # 基础行高（磅），三视图更高时按需拉伸
COL_WIDTH_IMG = 15              # 立绘列宽（Excel 单位，约对应 100px）
COL_WIDTH_TEXT = 16             # 文字列宽
COL_WIDTH_TYPE = 10             # 类型/赛季列宽

# 三视图使用原图（无损嵌入），仅在 Excel 里控制显示宽度、按原比例算高度
MODEL_DISPLAY_WIDTH = 500       # 三视图显示宽度（像素）
COL_WIDTH_MODEL = 72            # 三视图列宽 (~500px)
PX_TO_PT = 0.75                 # 像素 → 磅 换算（Excel 行高单位是磅）

TYPE_ORDER = {0: 0, 50: 1, 98: 2, 80: 3, 99: 4}
TYPE_LABEL = {0: '普通', 50: '异色卡', 98: '次元卡', 80: '王', 99: '幻境卡'}
SEASON_LABEL = {0: '未投放', 1: '主线', 2: 'S1', 3: 'S2', 4: 'S3', 5: 'S4'}


def load_json(path):
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)


def build_model_index(model_dir):
    """一次性扫描 D:/噜咪模型/，返回 { normalized_name: filepath } 用于查找。"""
    idx = {}
    for f in os.listdir(model_dir):
        base, ext = os.path.splitext(f)
        if ext.lower() not in ('.png', '.jpg', '.jpeg'):
            continue
        # 去掉 Char_ 前缀
        key = base
        if key.startswith('Char_'):
            key = key[5:]
        idx[key.lower()] = os.path.join(model_dir, f)
    return idx


def find_model_file(model_name, model_idx):
    """通过 Model 字段查找三视图，尝试多种降级匹配。"""
    if not model_name:
        return None
    key = model_name.lower()
    # 1. 精确匹配
    if key in model_idx:
        return model_idx[key]
    # 2. 尝试去掉常见后缀
    for suffix in ('_01', '_3d', '_full', '_baby'):
        if key.endswith(suffix):
            base = key[:-len(suffix)]
            if base in model_idx:
                return model_idx[base]
    # 3. 忽略下划线的近似匹配
    key_flat = key.replace('_', '')
    for k, v in model_idx.items():
        if k.replace('_', '') == key_flat:
            return v
    # 4. 手工特例（数据表里模型名跟资源不完全一致）
    manual = {
        'chicken_gugu': 'chichen_gugu',
        'otter_steelhelm': 'ottersteelhelm',
        'deer_solaris': 'deer_solarise',
        'butterfly_meteor_01': 'butterfly_meteor',
        'wolf_frostwild_3d': 'wolf_frostwild',
        'deer_rainbow_full': 'deer_rainbow_full_d',
    }
    if key in manual and manual[key] in model_idx:
        return model_idx[manual[key]]
    # 5. 前缀模糊匹配
    for k, v in model_idx.items():
        if k.startswith(key) or key.startswith(k):
            return v
    return None


def find_avatar(lumi_id):
    p = os.path.join(AVATAR_DIR, f'CA_{lumi_id}.png')
    return p if os.path.exists(p) else None


def resize_image(src_path, size, tmp_dir):
    """缩放图片到正方形（保持比例，用透明背景填充）。返回临时文件路径。"""
    try:
        img = PILImage.open(src_path).convert('RGBA')
    except Exception as e:
        print(f'  ⚠️ 读取图片失败: {src_path} - {e}')
        return None
    # 等比缩放
    img.thumbnail((size, size), PILImage.LANCZOS)
    # 贴到正方形透明画布
    canvas = PILImage.new('RGBA', (size, size), (255, 255, 255, 0))
    off_x = (size - img.width) // 2
    off_y = (size - img.height) // 2
    canvas.paste(img, (off_x, off_y), img)
    # 存到临时文件
    tmp_path = os.path.join(tmp_dir, f'tmp_{os.path.basename(src_path)}.png')
    canvas.save(tmp_path, 'PNG')
    return tmp_path


def get_evo_targets(lumi_id, evo_data):
    """返回该 Lumi 的直接进化目标列表（去重），以及是否为分支。"""
    targets = []
    seen = set()
    for e in evo_data:
        if e['Lumi'] != lumi_id:
            continue
        tid = e.get('evoLumiID', 0)
        if tid > 0 and tid not in seen:
            targets.append(tid)
            seen.add(tid)
        for _, gid in e.get('GenderEvo', []):
            if gid not in seen:
                targets.append(gid)
                seen.add(gid)
    is_branch = len(targets) > 1
    return targets, is_branch


def build_chain(start_id, evo_data, visited=None):
    """
    返回该起始 Lumi 的进化链（Id 列表）。
    - 线性进化：[base, evo1, evo2, ...]
    - 分支进化：[base, branch1, branch2, ...]（分支占用连续槽位）
    """
    if visited is None:
        visited = set()
    chain = [start_id]
    if start_id in visited:
        return chain
    visited.add(start_id)
    targets, is_branch = get_evo_targets(start_id, evo_data)
    if not targets:
        return chain
    if is_branch:
        # 所有分支平铺（分支目标经确认均为终点，不再深挖）
        for t in targets:
            chain.append(t)
            visited.add(t)
    else:
        sub = build_chain(targets[0], evo_data, visited)
        chain.extend(sub)
    return chain


def main():
    print('📖 读取数据...')
    lumi_data = load_json(f'{DATA_DIR}/Lumi.json')
    evo_data = load_json(f'{DATA_DIR}/LumiEvolution.json')
    zh = load_json(f'{DATA_DIR}/zh-CN.json')
    en = load_json(f'{DATA_DIR}/en.json')
    lumi_by_id = {l['Id']: l for l in lumi_data}

    print(f'   噜咪总数 {len(lumi_data)}，进化记录 {len(evo_data)}')

    # 建立三视图索引
    print('🖼️  扫描三视图目录...')
    model_idx = build_model_index(MODEL_DIR)
    print(f'   索引文件 {len(model_idx)} 个')

    # 找出所有被进化到的 Id（不作为首形态出现）
    evolved_into = set()
    for e in evo_data:
        if e.get('evoLumiID', 0) > 0:
            evolved_into.add(e['evoLumiID'])
        for _, lid in e.get('GenderEvo', []):
            evolved_into.add(lid)

    # ---- 组装行 ----
    rows = []

    # 普通（CardBack=0）：首形态 + 进化链
    normal_first = [l for l in lumi_data
                    if l.get('CardBack', 0) == 0
                    and l.get('LumiTag', 0) != 0
                    and l['Id'] not in evolved_into]
    for l in normal_first:
        chain = build_chain(l['Id'], evo_data)
        rows.append({
            'type': 0,
            'season': l.get('LumiTag', 0),
            'pokedex': l.get('PokedexId', 0),
            'chain': chain,
        })

    # 特殊卡（异色/3D/王/幻境）：独立一行
    for cb in (50, 98, 80, 99):
        specials = [l for l in lumi_data
                    if l.get('CardBack', 0) == cb
                    and l.get('LumiTag', 0) != 0]
        for l in specials:
            rows.append({
                'type': cb,
                'season': l.get('LumiTag', 0),
                'pokedex': l.get('PokedexId', 0),
                'chain': [l['Id']],
            })

    # 排序：类型 → PokedexId
    rows.sort(key=lambda r: (TYPE_ORDER[r['type']], r['pokedex']))

    max_chain_len = max(len(r['chain']) for r in rows)
    print(f'📊 总行数 {len(rows)}，最长进化链 {max_chain_len} 段')

    # ---- 生成 Excel ----
    print('📝 生成 Excel...')
    wb = Workbook()
    ws = wb.active
    ws.title = '噜咪信息汇总'

    # 表头
    header = ['类型', '获取途径']
    for i in range(1, max_chain_len + 1):
        stage = '第一形态' if i == 1 else f'第{["一","二","三","四","五","六","七","八","九"][i-1]}进化'
        header += [f'{stage}中文名', f'{stage}英文名', f'{stage}立绘', f'{stage}三视图']
    for i, h in enumerate(header, 1):
        c = ws.cell(row=1, column=i, value=h)
        c.font = Font(bold=True)
        c.alignment = Alignment(horizontal='center', vertical='center')
        c.fill = PatternFill('solid', fgColor='FFE699')

    # 列宽
    ws.column_dimensions['A'].width = COL_WIDTH_TYPE
    ws.column_dimensions['B'].width = COL_WIDTH_TYPE
    for i in range(max_chain_len):
        base_col = 3 + i * 4
        ws.column_dimensions[get_column_letter(base_col)].width = COL_WIDTH_TEXT       # 中文
        ws.column_dimensions[get_column_letter(base_col + 1)].width = COL_WIDTH_TEXT   # 英文
        ws.column_dimensions[get_column_letter(base_col + 2)].width = COL_WIDTH_IMG    # 立绘 (~100px)
        ws.column_dimensions[get_column_letter(base_col + 3)].width = COL_WIDTH_MODEL  # 三视图 (~500px 显示，原图存储)

    ws.row_dimensions[1].height = 24

    # 用 TemporaryDirectory 保存缩放后的图片，写完统一清理
    tmp_dir = tempfile.mkdtemp(prefix='lumi_xlsx_')
    missing_avatars = []
    missing_models = []

    total_rows = len(rows)
    for row_idx, r in enumerate(rows, start=2):
        if (row_idx - 1) % 20 == 0 or row_idx == total_rows + 1:
            print(f'  处理行 {row_idx - 1}/{total_rows}...')
        ws.cell(row=row_idx, column=1, value=TYPE_LABEL.get(r['type'], '?')).alignment = Alignment(horizontal='center', vertical='center')
        ws.cell(row=row_idx, column=2, value=SEASON_LABEL.get(r['season'], '?')).alignment = Alignment(horizontal='center', vertical='center')

        # 收集本行三视图最大高度，用于设置行高
        row_max_model_h_px = 0

        for stage_i, lid in enumerate(r['chain']):
            base_col = 3 + stage_i * 4
            l = lumi_by_id.get(lid)
            if not l:
                continue
            name_key = l.get('Name', '')
            zh_name = zh.get(name_key, name_key)
            en_name = en.get(name_key, name_key)
            ws.cell(row=row_idx, column=base_col, value=zh_name).alignment = Alignment(horizontal='center', vertical='center', wrap_text=True)
            ws.cell(row=row_idx, column=base_col + 1, value=en_name).alignment = Alignment(horizontal='center', vertical='center', wrap_text=True)

            # 立绘（继续用 100x100 缩略图，透明背景居中）
            avatar_path = find_avatar(lid)
            if avatar_path:
                resized = resize_image(avatar_path, IMG_SIZE, tmp_dir)
                if resized:
                    img = XLImage(resized)
                    img.width = IMG_SIZE
                    img.height = IMG_SIZE
                    anchor_cell = f'{get_column_letter(base_col + 2)}{row_idx}'
                    ws.add_image(img, anchor_cell)
            else:
                missing_avatars.append(lid)

            # 三视图：插入原图字节，不做任何缩放；仅通过 img.width/height 控制 Excel 里的显示尺寸
            model_name = l.get('Model', '')
            model_path = find_model_file(model_name, model_idx)
            if model_path:
                try:
                    with PILImage.open(model_path) as pim:
                        orig_w, orig_h = pim.size
                    img = XLImage(model_path)  # openpyxl 会把原文件直接嵌入到 xlsx
                    display_h = int(MODEL_DISPLAY_WIDTH * orig_h / orig_w)
                    img.width = MODEL_DISPLAY_WIDTH
                    img.height = display_h
                    anchor_cell = f'{get_column_letter(base_col + 3)}{row_idx}'
                    ws.add_image(img, anchor_cell)
                    row_max_model_h_px = max(row_max_model_h_px, display_h)
                except Exception as e:
                    print(f'  ⚠️ 三视图嵌入失败: {model_path} - {e}')
                    missing_models.append((lid, model_name))
            else:
                missing_models.append((lid, model_name))

        # 行高：max(基础, 本行三视图最高像素 × 0.75 → pt)
        row_height_pt = max(ROW_HEIGHT_PT_BASE, row_max_model_h_px * PX_TO_PT)
        ws.row_dimensions[row_idx].height = row_height_pt

    # 冻结表头
    ws.freeze_panes = 'C2'

    print(f'💾 保存到 {OUTPUT}')
    wb.save(OUTPUT)

    # 清理临时缩放图片
    shutil.rmtree(tmp_dir, ignore_errors=True)

    # 报告
    print('')
    print(f'✅ 完成！共 {len(rows)} 行')
    if missing_avatars:
        print(f'⚠️  缺少立绘 {len(missing_avatars)} 个: {missing_avatars[:10]}{"..." if len(missing_avatars)>10 else ""}')
    if missing_models:
        print(f'⚠️  缺少三视图 {len(missing_models)} 个:')
        for lid, m in missing_models:
            print(f'    Id={lid} Model={m}')


if __name__ == '__main__':
    main()
