"""Build the staff weekly-schedule spreadsheet (Arabic, RTL) from the example in the chat."""
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter
from openpyxl.comments import Comment

OUT = '/home/claude/carwash/docs/staff-weekly-schedule.xlsx'
DAYS = ['السبت', 'الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة']
F = 'Arial'
thin = Side(style='thin', color='CBD5E1')
border = Border(left=thin, right=thin, top=thin, bottom=thin)
hdr_fill = PatternFill('solid', fgColor='0F2540'); hdr_font = Font(name=F, bold=True, color='FFFFFF')
input_fill = PatternFill('solid', fgColor='FFFF00'); input_font = Font(name=F, color='0000FF')
total_fill = PatternFill('solid', fgColor='F1F5F9'); bold = Font(name=F, bold=True)
center = Alignment(horizontal='center', vertical='center')

# Example data (from the chat): staff → compound → capacity per day (Sat..Fri); None = off
STAFF = [
    ('أحمد سمير', 'EMP-001', {
        'كمبوند 1': [32, 32, None, None, None, 16, None],
        'كمبوند 2': [None, None, 32, 32, None, None, None],
        'كمبوند 3': [None, None, None, None, None, 16, None],
    }),
    ('محمود حسن', 'EMP-002', {
        'كمبوند 1': [None, None, 32, 32, 32, None, None],
    }),
    ('يوسف نبيل', 'EMP-003', {
        'كمبوند 2': [16, 16, 16, 16, 16, 16, None],
        'كمبوند 3': [16, 16, 16, 16, 16, 16, None],
    }),
]
COMPOUNDS = ['كمبوند 1', 'كمبوند 2', 'كمبوند 3']

wb = Workbook()
ws = wb.active; ws.title = 'الجدول الأسبوعي'; ws.sheet_view.rightToLeft = True

ws['A1'] = 'الجدول الأسبوعي للعمال — عدد السيارات يومياً في كل كمبوند'; ws['A1'].font = Font(name=F, bold=True, size=14, color='0F2540')
ws['A2'] = 'املأ الخلايا الصفراء فقط: الرقم = طاقة العامل (عدد السيارات) في هذا الكمبوند هذا اليوم. اتركها فارغة إذا لا يعمل هناك ذلك اليوم. صفوف "إجمالي اليوم" والورقة الثانية تُحسب تلقائياً.'
ws['A2'].font = Font(name=F, italic=True, color='475569'); ws['A2'].alignment = Alignment(wrap_text=True, vertical='top'); ws.merge_cells('A2:K2'); ws.row_dimensions[2].height = 32

headers = ['العامل', 'الكود', 'الكمبوند'] + DAYS + ['إجمالي الأسبوع']
row = 4
ws.append([])  # row 3 blank
for i, h in enumerate(headers, start=1):
    c = ws.cell(row=row, column=i, value=h); c.font = hdr_font; c.fill = hdr_fill; c.alignment = center; c.border = border
row += 1
first_data_row = row
staff_blocks = []  # (start_row, end_row) for day totals
for name, code, comps in STAFF:
    start = row
    for comp, caps in comps.items():
        ws.cell(row=row, column=1, value=name).font = Font(name=F, bold=(row == start))
        ws.cell(row=row, column=2, value=code).font = Font(name=F)
        ws.cell(row=row, column=3, value=comp).font = Font(name=F)
        for d, cap in enumerate(caps):
            c = ws.cell(row=row, column=4 + d, value=cap); c.fill = input_fill; c.font = input_font; c.alignment = center; c.border = border
        wk = ws.cell(row=row, column=11, value=f'=SUM(D{row}:J{row})'); wk.font = Font(name=F); wk.alignment = center; wk.border = border
        for col in range(1, 4): ws.cell(row=row, column=col).border = border
        row += 1
    end = row - 1
    # per-staff day total
    ws.cell(row=row, column=1, value=f'إجمالي اليوم — {name}').font = bold
    for col in range(1, 12): ws.cell(row=row, column=col).fill = total_fill; ws.cell(row=row, column=col).border = border
    for d in range(7):
        col = get_column_letter(4 + d)
        c = ws.cell(row=row, column=4 + d, value=f'=SUM({col}{start}:{col}{end})'); c.font = bold; c.alignment = center
    c = ws.cell(row=row, column=11, value=f'=SUM(K{start}:K{end})'); c.font = bold; c.alignment = center
    staff_blocks.append((start, end)); row += 2
last_data_row = row - 1
ws.cell(row=first_data_row, column=4).comment = Comment('قيم تجريبية من المثال في المحادثة — عدّلها حسب عمالك الفعليين.', 'Claude')

# legend
row += 1
ws.cell(row=row, column=1, value='دليل الألوان').font = bold; row += 1
c = ws.cell(row=row, column=1, value='خلية صفراء بخط أزرق'); c.fill = input_fill; c.font = input_font
ws.cell(row=row, column=2, value='تُملأ يدوياً (طاقة العامل في الكمبوند لهذا اليوم)').font = Font(name=F); row += 1
c = ws.cell(row=row, column=1, value='خلية رمادية بخط أسود'); c.fill = total_fill; c.font = bold
ws.cell(row=row, column=2, value='تُحسب تلقائياً — لا تعدّلها').font = Font(name=F); row += 1
ws.cell(row=row, column=1, value='ملاحظة: الجمعة يوم الإجازة الافتراضي، لذلك تُترك فارغة. العامل الذي يخدم كمبوندين في نفس اليوم تكون له طاقة في كل منهما (مثلاً 16 + 16).').font = Font(name=F, italic=True, color='475569')

widths = {1: 22, 2: 10, 3: 14, 11: 14}
for col in range(1, 12): ws.column_dimensions[get_column_letter(col)].width = widths.get(col, 9)
ws.freeze_panes = 'D5'

# ───── Sheet 2: load per compound per day (SUMIFS over sheet 1) ─────
ws2 = wb.create_sheet('طاقة الكمبوند يومياً'); ws2.sheet_view.rightToLeft = True
ws2['A1'] = 'إجمالي طاقة العمال لكل كمبوند في كل يوم (يُحسب تلقائياً من الجدول الأسبوعي)'; ws2['A1'].font = Font(name=F, bold=True, size=13, color='0F2540')
ws2['A2'] = 'قارن هذه الأرقام مع عدد السيارات المشتركة في كل يوم غسيل (لوحة عمليات الغسيل → عدد السيارات لكل يوم غسيل) لتعرف إن كانت الطاقة تكفي.'; ws2['A2'].font = Font(name=F, italic=True, color='475569')
hdr2 = ['الكمبوند'] + DAYS + ['إجمالي الأسبوع']
for i, h in enumerate(hdr2, start=1):
    c = ws2.cell(row=4, column=i, value=h); c.font = hdr_font; c.fill = hdr_fill; c.alignment = center; c.border = border
sheet1 = "'الجدول الأسبوعي'"
r = 5
for comp in COMPOUNDS:
    ws2.cell(row=r, column=1, value=comp).font = Font(name=F)
    for d in range(7):
        col = get_column_letter(4 + d)
        c = ws2.cell(row=r, column=2 + d, value=f'=SUMIFS({sheet1}!${col}${first_data_row}:${col}${last_data_row},{sheet1}!$C${first_data_row}:$C${last_data_row},$A{r})')
        c.font = Font(name=F); c.alignment = center; c.border = border
    c = ws2.cell(row=r, column=9, value=f'=SUM(B{r}:H{r})'); c.font = bold; c.alignment = center; c.border = border
    ws2.cell(row=r, column=1).border = border
    r += 1
ws2.cell(row=r, column=1, value='الإجمالي').font = bold
for col in range(2, 10):
    L = get_column_letter(col); c = ws2.cell(row=r, column=col, value=f'=SUM({L}5:{L}{r - 1})'); c.font = bold; c.alignment = center; c.fill = total_fill; c.border = border
ws2.cell(row=r, column=1).fill = total_fill; ws2.cell(row=r, column=1).border = border
ws2.cell(row=r + 2, column=1, value='أضف اسم كمبوند جديد في العمود A هنا وفي الجدول الأسبوعي بنفس الإملاء ليُحسب تلقائياً.').font = Font(name=F, italic=True, color='475569')
for col in range(1, 10): ws2.column_dimensions[get_column_letter(col)].width = 14 if col in (1, 9) else 10

wb.save(OUT); print(OUT, 'first', first_data_row, 'last', last_data_row)
