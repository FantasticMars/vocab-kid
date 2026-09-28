import json, re, sys
sys.path.insert(0,'.')
from chars_src import C
from dict_src import UNITS
from pypinyin import pinyin, Style, load_phrases_dict
rows = json.load(open('sheet_rows.json'))
Y = {"Y3":"恒圣萌妥轴阁培厘","Y4":"申介绍宗旨占乏","Y7":"螺螃蟹鲤鲫鲨","Y8":"睁眨瞪瞅怒眶呆睹"}
def lesson_id(h, ch):
    m = re.match(r'第(\d+)课', h)
    if m: return "L"+m.group(1)
    for k,v in Y.items():
        if ch in v: return k
    raise Exception(h+ch)
OVR = {"热闹":"rè nao","招呼":"zhāo hu","觉得":"jué de","意思":"yì si","主意":"zhǔ yi","告诉":"gào su",
 "寻思":"xún si","衣服":"yī fu","葫芦":"hú lu","眼睛":"yǎn jing","凉快":"liáng kuai","哈欠":"hā qian",
 "漂亮":"piào liang","透亮":"tòu liang","答应":"dā ying","故事":"gù shi","清楚":"qīng chu","屋子":"wū zi",
 "乡亲们":"xiāng qīn men","挑明":"tiǎo míng","挑战":"tiǎo zhàn","朝代":"cháo dài","朝向":"cháo xiàng",
 "差劲":"chà jìn","处罚":"chǔ fá","奏乐":"zòu yuè","相宜":"xiāng yí","毛病":"máo bìng","道理":"dào lǐ",
 "明白":"míng bai","尾巴":"wěi ba","脚印":"jiǎo yìn","一字不漏":"yí zì bú lòu","一本正经":"yì běn zhèng jīng",
 "大吃一惊":"dà chī yì jīng","人云亦云":"rén yún yì yún","比比皆是":"bǐ bǐ jiē shì","人人皆知":"rén rén jiē zhī",
 "美不胜收":"měi bú shèng shōu","应有尽有":"yīng yǒu jìn yǒu","奋发图强":"fèn fā tú qiáng","亮晶晶":"liàng jīng jīng",
 "悄悄话":"qiāo qiāo huà","急急忙忙":"jí jí máng máng","鸦雀无声":"yā què wú shēng","一枚":"yì méi","不肯":"bù kěn",
 "不错":"bú cuò","不断":"bú duàn","不仅":"bù jǐn","晒太阳":"shài tài yáng","暴风雨":"bào fēng yǔ",
 "差一点":"chà yì diǎn","差不多":"chà bu duō","另一个":"lìng yí gè","静悄悄":"jìng qiāo qiāo",
 "脸蛋":"liǎn dàn","哦":"ò","摇晃":"yáo huàng","打招呼":"dǎ zhāo hu","捉迷藏":"zhuō mí cáng","软绵绵":"ruǎn mián mián",
 "耳朵":"ěr duo","抽屉":"chōu ti","眨巴":"zhǎ ba","瞅瞅":"chǒu chou","画龙点睛":"huà lóng diǎn jīng",
 "熟视无睹":"shú shì wú dǔ","热泪盈眶":"rè lèi yíng kuàng","大白鲨":"dà bái shā","宝葫芦":"bǎo hú lu",
 "一个":"yí gè","为难":"wéi nán","长度":"cháng dù","兴奋":"xīng fèn","重新":"chóng xīn","尽管":"jǐn guǎn",
 "分散":"fēn sàn","着急":"zháo jí","难得":"nán dé","难道":"nán dào","难过":"nán guò","得到":"dé dào",
 "角落":"jiǎo luò","降落":"jiàng luò","落叶":"luò yè","落下":"luò xià","相互":"xiāng hù","互相":"hù xiāng",
 "卷尺":"juǎn chǐ","卷发":"juǎn fà","花卷":"huā juǎn","卷起":"juǎn qǐ","钻进":"zuān jìn","钻孔":"zuān kǒng","钻研":"zuān yán",
 "划船":"huá chuán","划开":"huá kāi","划水":"huá shuǐ","贝壳":"bèi ké","外壳":"wài ké","蛋壳":"dàn ké",
 "盛开":"shèng kāi","茂盛":"mào shèng","盛大":"shèng dà","使劲":"shǐ jìn","劲头":"jìn tóu","后劲":"hòu jìn",
 "血液":"xuè yè","鲜血":"xiān xuè","心血":"xīn xuè","度过":"dù guò","温度":"wēn dù","挑灯":"tiǎo dēng",
 "朝廷":"cháo tíng","粘贴":"zhān tiē","粘住":"zhān zhù","粘连":"zhān lián","车轴":"chē zhóu","轴心":"zhóu xīn","画轴":"huà zhóu",
 "涂抹":"tú mǒ","抹掉":"mǒ diào","凉爽":"liáng shuǎng","冰凉":"bīng liáng","清凉":"qīng liáng",
 "床单":"chuáng dān","简单":"jiǎn dān","单独":"dān dú","司马光":"sī mǎ guāng","结尾":"jié wěi","尾声":"wěi shēng",
 "占领":"zhàn lǐng","占有":"zhàn yǒu","占据":"zhàn jù","占地":"zhàn dì","蒲扇":"pú shàn","羽扇":"yǔ shàn",
 "汽油":"qì yóu","呼唤":"hū huàn","呼喊":"hū hǎn","呼叫":"hū jiào","发呆":"fā dāi","呆板":"dāi bǎn",
 "思念":"sī niàn","念头":"niàn tou","欠缺":"qiàn quē","亏欠":"kuī qiàn","觉察":"jué chá","察觉":"chá jué","知觉":"zhī jué",
 "塘":"táng","勾勒":"gōu lè","勾住":"gōu zhù","勾画":"gōu huà","频频":"pín pín","频次":"pín cì",
 "打击":"dǎ jī","游击":"yóu jī","支持":"zhī chí","舍弃":"shě qì","好朋友":"hǎo péng you",
 "朋友":"péng you","姿势":"zī shì","便":"biàn","冲刺":"chōng cì","刺眼":"cì yǎn","刺猬":"cì wei",
 "枯荣":"kū róng","昆曲":"kūn qǔ","转":"zhuǎn","答案":"dá àn","图案":"tú àn","方案":"fāng àn",
 "扬起":"yáng qǐ","晒干":"shài gān","值得":"zhí dé","白霜":"bái shuāng","门票":"mén piào","厚实":"hòu shi","强壮":"qiáng zhuàng","刚强":"gāng qiáng","处":"chǔ","东西":"dōng xi",
}
def py(word):
    if word in OVR: return OVR[word]
    return " ".join(x[0] for x in pinyin(word, style=Style.TONE))
charinfo = {}
for (h,ch,p,rad,struct,words,strokes) in rows:
    charinfo[ch] = dict(lesson=lesson_id(h,ch), pinyin=p, radical=rad, structure=struct, strokes=strokes)
problems=[]
out_units=[]
allchars=set()
for uid,utitle,lessons in UNITS:
    U={"id":uid,"title":utitle,"lessons":[]}
    for lid,ltitle,words in lessons:
        L={"id":lid,"title":ltitle,"chars":[],"tingxie":[]}
        for w in words.split():
            given=[]; plain=""
            i=0; idx=0
            for m in re.finditer(r'\[(.)\]|(.)', w):
                if m.group(1): given.append(idx); plain+=m.group(1)
                else: plain+=m.group(2)
                idx+=1
            e={"w":plain,"py":py(plain)}
            if given: e["given"]=given
            L["tingxie"].append(e)
            allchars.update(plain)
        for ch,info in charinfo.items():
            if info["lesson"]!=lid: continue
            ws, sent = C[ch].split("|")
            ws = ws.split()
            for x in ws:
                if ch not in x: problems.append(("word lacks char",ch,x))
            if ch not in sent: problems.append(("sentence lacks char",ch,sent))
            sw = [x for x in ws if len(x)>1 and x in sent]
            item={"char":ch,"pinyin":info["pinyin"],"radical":info["radical"],"strokes":info["strokes"],
                  "structure":info["structure"],
                  "words":[{"w":x,"py":py(x)} for x in ws],
                  "sentence":sent}
            if sw: item["sentenceWord"]=max(sw,key=len)
            else: problems.append(("no sentence word",ch,sent))
            L["chars"].append(item)
            allchars.add(ch)
        U["lessons"].append(L)
    out_units.append(U)
# verify char pinyin appears consistent inside its word pinyin
for U in out_units:
  for L in U["lessons"]:
    for c in L["chars"]:
      for wd in c["words"]:
        syl = wd["py"].split()
        k = wd["w"].index(c["char"])
        if len(syl)==len(wd["w"]):
          s=syl[k]
          import unicodedata
          base=lambda t: unicodedata.normalize('NFD',t).encode('ascii','ignore').decode()
          if s!=c["pinyin"] and not (base(s)==base(c["pinyin"]) and s==base(s)):
            problems.append(("pinyin mismatch",c["char"],c["pinyin"],wd["w"],wd["py"]))
        else: problems.append(("syl count",wd["w"],wd["py"]))
data={"subject":"语文","book":"部编版 三年级上册（2024新版）","source":"四会生字组词课课贴 + 基础字词每日一练（看拼音写词语）","units":out_units}
json.dump(data,open('../../data/alex-hanzi.json','w'),ensure_ascii=False,indent=1)
n=sum(len(L["chars"]) for U in out_units for L in U["lessons"])
t=sum(len(L["tingxie"]) for U in out_units for L in U["lessons"])
print("chars",n,"tingxie",t)
hz=sorted(c for c in allchars if '\u4e00'<=c<='\u9fff')
open('allchars.txt','w').write("".join(hz))
print("writer chars", len(hz))
for p in problems: print(p)
