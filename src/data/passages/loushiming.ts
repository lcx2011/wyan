import { createFormalPassage, type LegacySegmentInput, type LegacySentenceInput, type Passage } from '../../types';

/**
 * 陋室铭（唐 刘禹锡）
 * 部编版 七年级下册 必背篇目。短文（<200 字），2-3 段。
 */

const seg0Cards: LegacySentenceInput[][] = [
  [
    {
      text: '山不在高，有仙则名。',
      meaning: '山不一定要高，有了仙人就出名了。',
    },
    {
      text: '水不在深，有龙则灵。',
      meaning: '水不一定要深，有了龙就灵异了。',
    },
  ],
  [
    {
      text: '斯是陋室，惟吾德馨。',
      meaning: '这是简陋的屋子，只因我品德高尚就不感到简陋了。',
    },
  ],
];

const seg1Cards: LegacySentenceInput[][] = [
  [
    {
      text: '苔痕上阶绿，草色入帘青。',
      meaning: '苔痕蔓延到台阶上，使台阶都绿了；草色映入竹帘，使室内染上青色。',
    },
    {
      text: '谈笑有鸿儒，往来无白丁。',
      meaning: '说说笑笑的是博学的人，来来往往的没有平民。',
    },
  ],
  [
    {
      text: '可以调素琴，阅金经。',
      meaning: '可以弹奏素朴的古琴，阅览珍贵的佛经。',
    },
    {
      text: '无丝竹之乱耳，无案牍之劳形。',
      meaning: '没有嘈杂的音乐扰乱耳朵，没有官府的公文劳累身心。',
    },
  ],
];

const seg2Cards: LegacySentenceInput[][] = [
  [
    {
      text: '南阳诸葛庐，西蜀子云亭。',
      meaning: '南阳有诸葛亮的草庐，西蜀有扬子云的亭子。',
    },
  ],
  [
    {
      text: '孔子云：何陋之有？',
      meaning: '孔子说：有什么简陋的呢？',
    },
  ],
];

const segments: LegacySegmentInput[] = [
  {
    index: 0,
    hint: '以山水作比引出"惟吾德馨"，点明主旨',
    cards: seg0Cards,
    sentences: seg0Cards.flat(),
  },
  {
    index: 1,
    hint: '描写陋室环境清幽、交往高雅、生活闲适，突出主人品德',
    cards: seg1Cards,
    sentences: seg1Cards.flat(),
  },
  {
    index: 2,
    hint: '以古代贤者自比，引用孔子之言作结',
    cards: seg2Cards,
    sentences: seg2Cards.flat(),
  },
];

export const loushiming: Passage = createFormalPassage({
  id: 'loushiming',
  title: '陋室铭',
  author: '刘禹锡',
  dynasty: '唐',
  grade: '七年级下',
  aliases: [],
  segments,
  updatedAt: '2025-07-11T00:00:00Z',
});
