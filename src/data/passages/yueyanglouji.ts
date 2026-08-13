import { createFormalPassage, type LegacySegmentInput, type LegacySentenceInput, type Passage } from '../../types';

/**
 * 岳阳楼记（北宋 范仲淹）
 * 部编版 九年级上册 必背篇目。
 */

const seg0Cards: LegacySentenceInput[][] = [
  [
    {
      text: '庆历四年春，滕子京谪守巴陵郡。',
      meaning: '庆历四年的春天，滕子京被贬为巴陵郡太守。',
    },
    {
      text: '越明年，政通人和，百废具兴。',
      meaning: '到了第二年，政事顺利，百姓和乐，各种荒废的事业都兴办起来了。',
    },
  ],
  [
    {
      text: '乃重修岳阳楼，增其旧制，刻唐贤今人诗赋于其上。',
      meaning: '于是重新修建岳阳楼，扩大它原有的规模，把唐代名家和当代人的诗赋刻在楼上。',
    },
    {
      text: '属予作文以记之。',
      meaning: '嘱托我写一篇文章来记述这件事。',
    },
  ],
];

const seg1Cards: LegacySentenceInput[][] = [
  [
    {
      text: '予观夫巴陵胜状，在洞庭一湖。',
      meaning: '我看那巴陵郡的美好景色，全在洞庭一湖上。',
    },
    {
      text: '衔远山，吞长江，浩浩汤汤，横无际涯；朝晖夕阴，气象万千。',
      meaning: '它连接着远处的山，吞吐长江的水，水波浩荡，宽阔无边；早晚阴晴变化，景象千变万化。',
    },
  ],
  [
    {
      text: '此则岳阳楼之大观也，前人之述备矣。',
      meaning: '这就是岳阳楼的雄伟景象，前人的记述已经很详尽了。',
    },
    {
      text: '然则北通巫峡，南极潇湘，迁客骚人，多会于此，览物之情，得无异乎？',
      meaning: '虽然如此，那么这里向北通向巫峡，向南直达潇水湘水，被降职远调的官吏和诗人，大多在这里聚会，观赏景物而触发的感情，大概会有所不同吧？',
    },
  ],
];

const seg2Cards: LegacySentenceInput[][] = [
  [
    {
      text: '若夫淫雨霏霏，连月不开，阴风怒号，浊浪排空；日星隐曜，山岳潜形；商旅不行，樯倾楫摧；薄暮冥冥，虎啸猿啼。',
      meaning: '像那连绵细雨纷纷而下，整月不晴的时候，阴冷的风狂吼，浑浊的浪涛冲向天空；太阳和星星隐藏起光辉，山岳隐没了形体；商人和旅客不能出行，桅杆倒下、船桨折断；傍晚天色昏暗，虎在长啸，猿在悲啼。',
    },
  ],
  [
    {
      text: '登斯楼也，则有去国怀乡，忧谗畏讥，满目萧然，感极而悲者矣。',
      meaning: '这时登上这座楼，就会产生离开国都、怀念家乡，担心被说坏话、惧怕被批评指责的情怀，满眼都是萧条的景象，感慨到了极点而悲伤。',
    },
  ],
];

const seg3Cards: LegacySentenceInput[][] = [
  [
    {
      text: '至若春和景明，波澜不惊，上下天光，一碧万顷；沙鸥翔集，锦鳞游泳；岸芷汀兰，郁郁青青。',
      meaning: '到了春风和煦、阳光明媚的时候，湖面平静，没有惊涛骇浪，天色湖光相连，一片碧绿，广阔无际；沙洲上的鸥鸟时而飞翔、时而停歇，美丽的鱼儿游来游去；岸上的香草、小洲上的兰花，草木茂盛，青翠欲滴。',
    },
  ],
  [
    {
      text: '而或长烟一空，皓月千里，浮光跃金，静影沉璧，渔歌互答，此乐何极！',
      meaning: '有时大片烟雾完全消散，皎洁的月光一泻千里，浮动的光像跳动的金子，静静的月影像沉入水中的玉璧，渔夫的歌声互相唱和，这种快乐哪有穷尽！',
    },
  ],
  [
    {
      text: '登斯楼也，则有心旷神怡，宠辱偕忘，把酒临风，其喜洋洋者矣。',
      meaning: '这时登上这座楼，就会感到心胸开阔、心情愉快，荣耀和屈辱一并忘掉，端着酒杯、吹着微风，那真是快乐高兴极了。',
    },
  ],
];

const seg4Cards: LegacySentenceInput[][] = [
  [
    {
      text: '嗟夫！予尝求古仁人之心，或异二者之为，何哉？',
      meaning: '唉！我曾经探求古代品德高尚的人的思想感情，或许不同于以上两种人的心情，这是为什么呢？',
    },
    {
      text: '不以物喜，不以己悲；居庙堂之高则忧其民；处江湖之远则忧其君。',
      meaning: '不因外物好坏和自己得失而或喜或悲；在朝廷做官就为百姓忧虑，身处僻远的江湖就为国君忧虑。',
    },
  ],
  [
    {
      text: '是进亦忧，退亦忧。',
      meaning: '这样说来，进入朝廷做官也担忧，退处江湖也担忧。',
    },
    {
      text: '然则何时而乐耶？其必曰"先天下之忧而忧，后天下之乐而乐"乎！',
      meaning: '那么什么时候才快乐呢？那一定要说"在天下人忧愁之前先忧愁，在天下人快乐之后才快乐"吧！',
    },
  ],
  [
    {
      text: '噫！微斯人，吾谁与归？',
      meaning: '唉！如果没有这种人，我同谁一道呢？',
    },
    {
      text: '时六年九月十五日。',
      meaning: '写于庆历六年九月十五日。',
    },
  ],
];

const segments: LegacySegmentInput[] = [
  {
    index: 0,
    hint: '先交代作记缘由：滕子京被贬后政绩卓著、重修岳阳楼，嘱托范仲淹作记',
    cards: seg0Cards,
    sentences: seg0Cards.flat(),
  },
  {
    index: 1,
    hint: '总写洞庭湖的雄伟景象，引出"览物之情，得无异乎"的设问',
    cards: seg1Cards,
    sentences: seg1Cards.flat(),
  },
  {
    index: 2,
    hint: '先写阴雨连绵的悲景，登楼者触景生情、感极而悲',
    cards: seg2Cards,
    sentences: seg2Cards.flat(),
  },
  {
    index: 3,
    hint: '再写春和景明的喜景，登楼者把酒临风、其喜洋洋',
    cards: seg3Cards,
    sentences: seg3Cards.flat(),
  },
  {
    index: 4,
    hint: '由两种览物之情，引出古仁人"不以物喜，不以己悲"的旷达胸襟与先忧后乐的抱负',
    cards: seg4Cards,
    sentences: seg4Cards.flat(),
  },
];

export const yueyanglouji: Passage = createFormalPassage({
  id: 'yueyanglouji',
  title: '岳阳楼记',
  author: '范仲淹',
  dynasty: '北宋',
  grade: '九年级上',
  aliases: [],
  segments,
  updatedAt: '2025-07-11T00:00:00Z',
});
