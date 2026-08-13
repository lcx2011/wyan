import { createFormalPassage, type LegacySegmentInput, type LegacySentenceInput, type Passage } from '../../types';

/**
 * 爱莲说（北宋 周敦颐）
 * 部编版 七年级下册 必背篇目。短文（<200 字），2-3 段。
 */

const seg0Cards: LegacySentenceInput[][] = [
  [
    {
      text: '水陆草木之花，可爱者甚蕃。',
      meaning: '水上、陆地上各种草本木本的花，值得喜爱的有很多。',
    },
    {
      text: '晋陶渊明独爱菊。',
      meaning: '晋朝的陶渊明唯独喜爱菊花。',
    },
  ],
  [
    {
      text: '自李唐来，世人甚爱牡丹。',
      meaning: '自从唐朝以来，世间的人很喜爱牡丹。',
    },
  ],
];

const seg1Cards: LegacySentenceInput[][] = [
  [
    {
      text: '予独爱莲之出淤泥而不染，濯清涟而不妖，中通外直，不蔓不枝，香远益清，亭亭净植，可远观而不可亵玩焉。',
      meaning: '我唯独喜爱莲花从淤泥中生长出来却不沾染污秽，经过清水洗涤却不显得妖艳，它的茎内空外直，不生蔓不长枝，香气远播更加清香，笔直洁净地立在那里，只可远远地观赏却不能靠近去玩弄啊。',
    },
  ],
  [
    {
      text: '予谓菊，花之隐逸者也；牡丹，花之富贵者也；莲，花之君子者也。',
      meaning: '我认为菊花，是花中的隐士；牡丹，是花中的富贵者；莲花，是花中的君子。',
    },
  ],
];

const seg2Cards: LegacySentenceInput[][] = [
  [
    {
      text: '噫！菊之爱，陶后鲜有闻。',
      meaning: '唉！对于菊花的喜爱，陶渊明以后就很少听到了。',
    },
    {
      text: '莲之爱，同予者何人？',
      meaning: '对于莲花的喜爱，像我一样的还有什么人呢？',
    },
  ],
  [
    {
      text: '牡丹之爱，宜乎众矣。',
      meaning: '对于牡丹的喜爱，当然人就很多了。',
    },
  ],
];

const segments: LegacySegmentInput[] = [
  {
    index: 0,
    hint: '先写世人爱牡丹、陶渊明爱菊，为下文"独爱莲"作铺垫',
    cards: seg0Cards,
    sentences: seg0Cards.flat(),
  },
  {
    index: 1,
    hint: '集中描写莲的品格，托物言志',
    cards: seg1Cards,
    sentences: seg1Cards.flat(),
  },
  {
    index: 2,
    hint: '以菊、牡丹衬托，点明莲为花中君子，感慨知音难觅',
    cards: seg2Cards,
    sentences: seg2Cards.flat(),
  },
];

export const ailianshuo: Passage = createFormalPassage({
  id: 'ailianshuo',
  title: '爱莲说',
  author: '周敦颐',
  dynasty: '北宋',
  grade: '七年级下',
  aliases: [],
  segments,
  updatedAt: '2025-07-11T00:00:00Z',
});
