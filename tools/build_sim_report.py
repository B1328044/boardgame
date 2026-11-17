"""把 simulate.mjs --json 的輸出整理成試算表報告。
每個情境一張「資料」工作表（每列＝一局中的一個座位）與一張「分析」工作表；
分析表的所有數字都是 COUNTIFS／SUMIFS／AVERAGEIFS 公式，直接引用資料表，可追溯每個結果。
用法：python tools/build_sim_report.py 輸出.xlsx 代號=檔案.json [代號=檔案.json ...]
"""
import json, sys
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter
from openpyxl.comments import Comment

FONT='Arial'
H=Font(name=FONT,bold=True,color='FFFFFF');HF=PatternFill('solid',fgColor='1F4E5A')
B=Font(name=FONT,bold=True);N=Font(name=FONT);BLUE=Font(name=FONT,color='0000FF');GREEN=Font(name=FONT,color='008000')
T=Font(name=FONT,bold=True,size=14);SUB=Font(name=FONT,bold=True,size=11,color='1F4E5A')
thin=Side(style='thin',color='D0D7D5');BOX=Border(top=thin,bottom=thin,left=thin,right=thin)
COLS=[('game','局號'),('players','人數'),('variant','玩法'),('seat','座位'),('level','Bot 難度'),('style','低難度個性'),('botKey','難度分組'),('destiny','天命卡'),('job','最終工作'),('jobName','工作名稱'),('tier','階層'),('jobsTaken','取得工作次數'),('car','有車(1/0)'),('carPolicy','買車策略'),('flights','出國次數'),('homePasses','經過家鄉次數'),('cash','現金(萬)'),('debt','負債(萬)'),('netWorth','淨資產(萬)'),('progress','目標進度(0–1)'),('bankrupt','破產(1/0)'),('win','勝場(平手均分)'),('rounds','結束季數'),('reason','結束原因')]
COL={k:get_column_letter(i+1) for i,(k,_) in enumerate(COLS)}
DESTINY={'D01':'看好你的富爸爸','D02':'學習天才','D03':'幸運星','D04':'鐵人體質','D05':'人脈王','D06':'勤儉持家','D07':'旅行家','D08':'車迷','D09':'學霸','D10':'家人後援'}
LEVEL={'high':'高','mid':'中','low-random':'低（隨機派）','low-gambler':'低（賭徒）','low-cautious':'低（保守派）'}

def raw_sheet(wb,name,recs):
    ws=wb.create_sheet(name)
    for i,(k,label) in enumerate(COLS,1):
        c=ws.cell(1,i,label);c.font=H;c.fill=HF;c.alignment=Alignment(horizontal='center',wrap_text=True)
        ws.column_dimensions[get_column_letter(i)].width=12
    for r,rec in enumerate(recs,2):
        rec=dict(rec);rec['botKey']=rec['level'] if rec['level']!='low' else f"low-{rec['style']}"
        for i,(k,_) in enumerate(COLS,1):ws.cell(r,i,rec.get(k)).font=N
    ws.freeze_panes='A2';ws.auto_filter.ref=f"A1:{get_column_letter(len(COLS))}{len(recs)+1}"
    return len(recs)+1

def rng(sheet,key,last):return f"'{sheet}'!${COL[key]}$2:${COL[key]}${last}"

def group_table(ws,row,title,note,sheet,last,key,items,fair_cell,extra_avg=True,crit=None):
    ws.cell(row,1,title).font=SUB;ws.cell(row+1,1,note).font=Font(name=FONT,italic=True,color='666666');row+=2
    heads=['分組','說明','座位數','勝場','勝率','相對公平倍數','95% 信賴區間下限（倍）','95% 信賴區間上限（倍）','平均淨資產(萬)','破產率']
    for i,hd in enumerate(heads,1):c=ws.cell(row,i,hd);c.font=H;c.fill=HF;c.alignment=Alignment(horizontal='center',wrap_text=True)
    first=row+1
    for code,label in items:
        row+=1
        k=ws.cell(row,1,code);k.font=BLUE
        ws.cell(row,2,label).font=N
        cond=f'{rng(sheet,key,last)},{crit(code) if crit else "$A"+str(row)}'
        ws.cell(row,3,f'=COUNTIFS({cond})')
        ws.cell(row,4,f'=SUMIFS({rng(sheet,"win",last)},{cond})')
        ws.cell(row,5,f'=IF(C{row}=0,0,D{row}/C{row})')
        ws.cell(row,6,f'=IF({fair_cell}=0,0,E{row}/{fair_cell})')
        ws.cell(row,7,f'=IF(C{row}=0,0,(E{row}-1.96*SQRT(E{row}*(1-E{row})/C{row}))/{fair_cell})')
        ws.cell(row,8,f'=IF(C{row}=0,0,(E{row}+1.96*SQRT(E{row}*(1-E{row})/C{row}))/{fair_cell})')
        ws.cell(row,9,f'=IF(C{row}=0,0,SUMIFS({rng(sheet,"netWorth",last)},{cond})/C{row})')
        ws.cell(row,10,f'=IF(C{row}=0,0,SUMIFS({rng(sheet,"bankrupt",last)},{cond})/C{row})')
        for c in range(1,11):
            ws.cell(row,c).border=BOX
            if c>2:ws.cell(row,c).font=N
        ws.cell(row,1).font=BLUE
        for c in (5,10):ws.cell(row,c).number_format='0.0%'
        for c in (6,7,8):ws.cell(row,c).number_format='0.00"x"'
        ws.cell(row,9).number_format='#,##0.0'
    return row+2

def analysis_sheet(wb,name,sheet,last,meta,recs):
    ws=wb.create_sheet(name)
    ws.column_dimensions['A'].width=16;ws.column_dimensions['B'].width=26
    for c in 'CDEFGHIJ':ws.column_dimensions[c].width=14
    ws['A1']=f"{name}｜{meta.get('label','')}";ws['A1'].font=T
    rows=[('資料工作表',sheet,'這張表所有公式都引用此工作表'),('局數',meta['games'],'simulate.mjs 參數'),('每局人數',meta['players'],'simulate.mjs 參數'),('種子位移',meta['offset'],'可用相同參數重現'),('Bot 難度','混合低／中／高' if meta['levels'] else '全部高難度','simulate.mjs 參數'),('買車策略',meta['carPolicy'],'auto＝Bot 自行判斷；mixed＝每個座位隨機 auto 或 never'),('玩法',{'jobs':'A 工作卡版','roles':'B 角色版'}.get(meta.get('variant','jobs')),'simulate.mjs --variant'),('勝利目標',meta['goal'],'A：data.js GOAL.netWorth；B：ROLES[].goal')]
    r=3
    for k,v,n in rows:
        ws.cell(r,1,k).font=B;c=ws.cell(r,2,v);c.font=BLUE;ws.cell(r,3,n).font=Font(name=FONT,color='666666');r+=1
    r+=1;ws.cell(r,1,'整體').font=SUB;r+=1
    W=rng(sheet,'win',last);R=rng(sheet,'rounds',last);P=rng(sheet,'players',last)
    summary=[('座位總數',f'=COUNTA({rng(sheet,"game",last)})','#,##0'),('勝場總數（應等於局數）',f'=SUM({W})','#,##0.00'),
             ('公平勝率（1/人數）',f'=1/B5','0.0%'),('平均結束季數',f'=AVERAGE({R})','0.0'),
             ('達標結束的局數',f'=COUNTIFS({rng(sheet,"reason",last)},"goal")/B5','#,##0'),('季數用完比淨資產的局數',f'=COUNTIFS({rng(sheet,"reason",last)},"progress")/B5','#,##0'),
             ('買車率',f'=AVERAGE({rng(sheet,"car",last)})','0.0%'),('平均出國次數',f'=AVERAGE({rng(sheet,"flights",last)})','0.00'),('平均經過家鄉次數',f'=AVERAGE({rng(sheet,"homePasses",last)})','0.0'),('破產率',f'=AVERAGE({rng(sheet,"bankrupt",last)})','0.0%'),('平均目標進度',f'=AVERAGE({rng(sheet,"progress",last)})','0.0%')]
    cells={}
    for k,f,fmt in summary:
        ws.cell(r,1,k).font=B;c=ws.cell(r,2,f);c.number_format=fmt;c.font=N;cells[k]=f'$B${r}';r+=1
    fair=cells['公平勝率（1/人數）']
    ws.cell(r,1,'檢查：勝場總數＝局數').font=B;ws.cell(r,2,f'=IF(ABS({cells["勝場總數（應等於局數）"]}-B4)<0.01,"OK","不符")').font=N;r+=1
    ws.cell(r,1,'檢查：座位數＝局數×人數').font=B;ws.cell(r,2,f'=IF({cells["座位總數"]}=B4*B5,"OK","不符")').font=N;r+=2
    ws.cell(5,2).comment=Comment('勝場：一局有 n 人平手時每人記 1/n 勝。','Claude')
    r=group_table(ws,r,'依天命卡','每張天命卡的座位勝率；倍數＝勝率÷公平勝率，信賴區間用常態近似。',sheet,last,'destiny',[(k,v) for k,v in DESTINY.items()],fair)
    jobs=sorted({(x['job'],x['jobName']) for x in recs})
    if meta.get('variant')=='roles':r=group_table(ws,r,'依角色','B 角色版：開局隨機分配的角色（各角色目標不同，季數用完時比目標進度）。',sheet,last,'job',jobs,fair)
    else:r=group_table(ws,r,'依最終工作','A 工作卡版：對局結束時手上的工作（J00＝沒有工作卡的基本工作）。',sheet,last,'job',jobs,fair)
    keys=sorted({x['level'] if x['level']!='low' else 'low-'+x['style'] for x in recs})
    if len(keys)>1:r=group_table(ws,r,'依 Bot 難度','低難度依個性分開統計。',sheet,last,'botKey',[(k,LEVEL.get(k,k)) for k in keys],fair)
    pols=sorted({x['carPolicy'] for x in recs})
    if len(pols)>1:r=group_table(ws,r,'依買車策略','auto＝會依收入與現金判斷買車；never＝從不買車。兩組座位隨機分配，可直接比較車子的價值。',sheet,last,'carPolicy',[(k,{'auto':'會買車','never':'從不買車'}.get(k,k)) for k in pols],fair)
    r=group_table(ws,r,'依是否有車','結束時有沒有車（受工作與收入影響，屬相關而非因果）。',sheet,last,'car',[(1,'有車'),(0,'沒車')],fair)
    r=group_table(ws,r,'依是否出國','結束時是否曾經出國（同樣是相關，不是因果）。',sheet,last,'flights',[('>0','出過國'),('0','沒出國')],fair,crit=lambda code:f'"{code}"')
    ws.freeze_panes='A3'

def main():
    out=sys.argv[1];pairs=[a.split('=',1) for a in sys.argv[2:]]
    wb=Workbook();ws=wb.active;ws.title='說明'
    ws['A1']='人生棋局 v4（A 工作卡版／B 角色版）Bot 模擬報告';ws['A1'].font=T
    lines=['這份試算表由 simulate.mjs 的對戰紀錄自動產生，每一列原始資料＝某一局中的一個座位。',
           '分析表裡的數字全部是公式（COUNTIFS／SUMIFS），直接引用原始資料，點進儲存格就能看到怎麼算的。',
           '勝場：一局的贏家記 1 勝；平手時均分（2 人平手各記 0.5）。所以勝場總數應等於局數，分析表有自動檢查。',
           '相對公平倍數＝分組勝率 ÷（1／每局人數）。1.00x 代表和隨機分配一樣；95% 信賴區間不含 1.00x 才算顯著。',
           '藍色字＝輸入或分組代碼；黑色字＝公式。',
           '重現方式：node personal/simulate.mjs 局數 人數 種子位移 --variant=jobs|roles [--levels] [--car=mixed] --json=檔名，再執行 python tools/build_sim_report.py。','']
    for i,t in enumerate(lines,3):ws.cell(i,1,t).font=N
    r=3+len(lines)
    for i,hd in enumerate(['代號','情境說明','局數','人數','種子位移','難度','買車策略','產生時間','玩法'],1):c=ws.cell(r,i,hd);c.font=H;c.fill=HF
    ws.column_dimensions['A'].width=10;ws.column_dimensions['B'].width=60
    for code,path in pairs:
        d=json.load(open(path,encoding='utf8'));meta=d['meta'];recs=d['records']
        r+=1;vals=[code,meta.get('label',''),meta['games'],meta['players'],meta['offset'],'混合' if meta['levels'] else '全高',meta['carPolicy'],meta['createdAt'][:19],{'jobs':'A 工作卡版','roles':'B 角色版'}.get(meta.get('variant','jobs'))]
        for i,v in enumerate(vals,1):ws.cell(r,i,v).font=BLUE if i>2 else N
        sheet=f'資料_{code}';last=raw_sheet(wb,sheet,recs)
        analysis_sheet(wb,f'分析_{code}',sheet,last,meta,recs)
    # 分析表排在資料表前面
    order=['說明']+[f'分析_{c}' for c,_ in pairs]+[f'資料_{c}' for c,_ in pairs]
    wb._sheets=[wb[n] for n in order]
    wb.save(out);print('saved',out)
main()
