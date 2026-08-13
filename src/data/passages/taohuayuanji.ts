import { createFormalPassage, type LegacySegmentInput, type LegacySentenceInput, type Passage } from '../../types';

/**
 * 桃花源记（东晋 陶渊明）
 * 部编版 八年级下册 必背篇目。
 */

const seg0Cards: LegacySentenceInput[][] = [
  [
    {
      text: '晋太元中，武陵人捕鱼为业。',
      meaning: '东晋太元年间，武陵有个以捕鱼为业的人。',
    },
    {
      text: '缘溪行，忘路之远近。',
      meaning: '有一天他沿着溪水划船前行，忘记了路程的远近。',
    },
  ],
  [
    {
      text: '忽逢桃花林，夹岸数百步，中无杂树，芳草鲜美，落英缤纷。',
      meaning: '忽然遇到一片桃花林，桃树夹着溪流两岸，长达几百步，中间没有别的树，芳草鲜嫩美丽，落花纷纷。',
    },
    {
      text: '渔人甚异之，复前行，欲穷其林。',
      meaning: '渔人对此感到非常惊异，又往前划，想要走到那片林子的尽头。',
    },
  ],
  [
    {
      text: '林尽水源，便得一山，山有小口，仿佛若有光。',
      meaning: '桃林在溪水发源的地方就到头了，便出现一座山，山上有个小洞口，隐隐约约好像有光亮。',
    },
    {
      text: '便舍船，从口入。',
      meaning: '他便舍弃船，从洞口进去。',
    },
  ],
  [
    {
      text: '初极狭，才通人。',
      meaning: '起初洞口很狭窄，仅容一个人通过。',
    },
    {
      text: '复行数十步，豁然开朗。',
      meaning: '又走了几十步，突然变得开阔明亮。',
    },
  ],
];

const seg1Cards: LegacySentenceInput[][] = [
  [
    {
      text: '土地平旷，屋舍俨然，有良田、美池、桑竹之属。',
      meaning: '这里土地平坦开阔，房屋整整齐齐，有肥沃的田地、美丽的池塘和桑树竹林之类。',
    },
    {
      text: '阡陌交通，鸡犬相闻。',
      meaning: '田间小路交错相通，村落间鸡鸣狗叫之声处处可以听到。',
    },
  ],
  [
    {
      text: '其中往来种作，男女衣着，悉如外人。',
      meaning: '人们在田野里来来往往耕种劳作，男女的穿戴，完全和桃花源外的人一样。',
    },
    {
      text: '黄发垂髫，并怡然自乐。',
      meaning: '老人和小孩，都悠闲愉快、自得其乐。',
    },
  ],
];

const seg2Cards: LegacySentenceInput[][] = [
  [
    {
      text: '见渔人，乃大惊，问所从来。',
      meaning: '村里人看到渔人，非常惊讶，问他从哪里来。',
    },
    {
      text: '具答之。',
      meaning: '渔人详细地回答了他们。',
    },
  ],
  [
    {
      text: '便要还家，设酒杀鸡作食。',
      meaning: '村里人便邀请他到自己家里去，摆酒杀鸡做饭来款待他。',
    },
    {
      text: '村中闻有此人，咸来问讯。',
      meaning: '村里听说有这样一个人，都来打听消息。',
    },
  ],
  [
    {
      text: '自云先世避秦时乱，率妻子邑人来此绝境，不复出焉，遂与外人间隔。',
      meaning: '他们自己说他们的祖先为了躲避秦时的战乱，率领妻子儿女和乡邻来到这个与世隔绝的地方，不再从这里出去，于是就和外面的人断绝了来往。',
    },
    {
      text: '问今是何世，乃不知有汉，无论魏晋。',
      meaning: '他们问现在是什么朝代，竟然不知道有过汉朝，更不用说魏、晋了。',
    },
  ],
  [
    {
      text: '此人一一为具言所闻，皆叹惋。',
      meaning: '渔人把自己知道的事一一详细地告诉了他们，村里人都感叹惋惜。',
    },
  ],
];

const seg3Cards: LegacySentenceInput[][] = [
  [
    {
      text: '余人各复延至其家，皆出酒食。',
      meaning: '其余的人各自又把渔人请到自己家中，都拿出酒饭来招待他。',
    },
    {
      text: '停数日，辞去。',
      meaning: '渔人停留了几天，就告辞离开了。',
    },
  ],
  [
    {
      text: '此中人语云："不足为外人道也。"',
      meaning: '村里人告诉他说："这里的事不值得对外面的人说。"',
    },
    {
      text: '既出，得其船，便扶向路，处处志之。',
      meaning: '渔人出来以后，找到了他的船，就沿着原来的路回去，处处做了标记。',
    },
  ],
  [
    {
      text: '及郡下，诣太守，说如此。',
      meaning: '到了郡城，去拜见太守，报告了这番经历。',
    },
    {
      text: '太守即遣人随其往，寻向所志，遂迷，不复得路。',
      meaning: '太守立即派人跟着他前往，寻找先前做的标记，竟然迷失了方向，再也找不到通往桃花源的路了。',
    },
  ],
];

const seg4Cards: LegacySentenceInput[][] = [
  [
    {
      text: '南阳刘子骥，高尚士也，闻之，欣然规往。',
      meaning: '南阳人刘子骥，是个志向高洁的隐士，听说了这件事，高兴地计划前往。',
    },
    {
      text: '未果，寻病终。',
      meaning: '没有实现，不久就病死了。',
    },
  ],
  [
    {
      text: '后遂无问津者。',
      meaning: '此后就再也没有探寻桃花源的人了。',
    },
  ],
];

const segments: LegacySegmentInput[] = [
  {
    index: 0,
    hint: '武陵渔人偶遇桃花林，沿溪探源，从狭窄洞口进入',
    cards: seg0Cards,
    sentences: seg0Cards.flat(),
  },
  {
    index: 1,
    hint: '进入桃花源，描绘安宁和乐的世外生活景象',
    cards: seg1Cards,
    sentences: seg1Cards.flat(),
  },
  {
    index: 2,
    hint: '村人热情款待，自述避乱来历，不知外界朝代',
    cards: seg2Cards,
    sentences: seg2Cards.flat(),
  },
  {
    index: 3,
    hint: '渔人辞别并做标记，太守派人寻找却迷失方向',
    cards: seg3Cards,
    sentences: seg3Cards.flat(),
  },
  {
    index: 4,
    hint: '刘子骥寻访未果，桃花源从此无人问津',
    cards: seg4Cards,
    sentences: seg4Cards.flat(),
  },
];

export const taohuayuanji: Passage = createFormalPassage({
  id: 'taohuayuanji',
  title: '桃花源记',
  author: '陶渊明',
  dynasty: '东晋',
  grade: '八年级下',
  aliases: [],
  segments,
  updatedAt: '2025-07-11T00:00:00Z',
});
