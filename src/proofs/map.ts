/**
 * ?proof=map[&play=ren|kohaku][&cleared=1..6][&panel=0]   (the dev panel is a tab under the Title button)
 *
 * The map painting itself from the player's best strokes. Seeds a realistic campaign save, opens the
 * map with real clicks on the title screen, and adds a dev-only panel to replay the paint-in, add a
 * clear (the "Continue the journey" path: paint-in, then the walk) and reset.
 *
 * Seeded strokes:
 *   - The First Scroll: a real run, recorded with the real mouse from the autoplay route (FIRST_RUN below).
 *   - Summer: the Summer scrolls are still greyboxes, so their best runs are synthesized from each
 *     scroll's real geometry: a hand-wobbled vermilion bridge over each gap, purple ring pairs over
 *     some of the wide gaps, gold zigzags over yokai, indigo over fires and up walls, in the same
 *     point spacing and widths the game saves (Game.serializeStrokes). Replace them with recorded
 *     runs once the real Summer autoplay routes exist.
 *
 * The proof swaps this browser's campaign save (and its campaign best times, which Free play shares
 * for the First Scroll) for the seeded one while the page is open, and puts the real one back when the
 * page is left (pagehide) or on "Restore my save". `&keep=1` keeps the seeded save after leaving, for the
 * test harness, which then loads the game itself in a throwaway browser profile.
 */
import { loadBest } from '../game';
import { groundAt, type Level } from '../level';
import { mulberry32, noise1, range } from '../rng';
import { nextScroll, scrollOrder } from '../campaign/data';
import { campaignLevels } from '../campaign/registry';
import { CAMPAIGN_KEY, saveBestStrokes, type MapStroke } from '../campaign/save';
import type { CampaignMap } from '../campaign/map';
import type { ProofContext } from './index';

/** The First Scroll, recorded from a real autoplay run (real mouse, Ren, 46.67 s, 竹, 0 falls) with tools/proofs/map.mjs record. */
const FIRST_RUN = {
  char: 'ren',
  time: 46.67,
  grade: '竹',
  len: 15400,
  strokes: [
  { k: 'shu', p: [2865,552,17,2873,551,17.7,2881,551,17.5,2889,550,17.2,2897,550,17.3,2905,549,17.9,2913,548,18.2,2921,547,18.4,2929,547,18.4,2937,546,18.5,2945,545,18.5,2953,545,18.5,2960,544,18.5,2968,543,18.5,2976,543,18.5,2984,542,18.5,2992,542,18.5,3000,541,18.5,3008,540,18.5,3016,540,18.5,3024,539,18.5,3032,539,18.5,3040,538,18.5,3048,538,18.5,3056,537,18.5,3064,537,18.4,3072,537,18.4,3080,536,18.4,3088,536,18.4,3096,536,18.4,3104,535,18.4,3112,535,18.4,3120,535,18.4,3127,535,18.4,3135,535,18.4,3143,534,18.4,3151,534,18.4,3159,534,18.4,3167,534,18.4,3175,534,18.4,3183,534,18.4,3191,534,18.4,3199,534,18.4,3207,534,18.4,3215,534,18.4,3223,534,18.4,3231,535,18.4,3239,535,18.4,3247,535,18.4,3255,535,18.4,3263,535,18.4,3271,536,18.4,3279,536,18.4,3287,536,18.4,3295,537,18.4,3303,537,18.4,3311,538,18.4,3319,538,18.4,3327,538,18.4,3335,539,18.4,3342,539,18.4,3350,540,18.4,3358,540,18.4,3366,541,18.4,3374,541,18.6,3382,542,18.2,3390,543,17.6,3398,543,18,3406,544,18.2,3414,545,18.3,3422,545,18.3,3430,546,18.3,3438,546,18.3,3446,547,18.4,3454,548,18.4,3462,549,18.4,3470,549,18.4,3477,550,18.3,3485,551,18.3,3493,551,18.4,3501,552,18.3] },
  { k: 'shu', p: [4185,552,17,4191,547,17.7,4198,543,17.5,4205,539,17.4,4212,535,17.5,4218,531,18,4225,526,18.2,4231,521,18.4,4237,516,18.4,4243,511,18.5,4250,506,18.5,4256,501,18.5,4262,496,18.5,4268,491,18.5,4275,487,18.5,4281,482,18.5,4288,477,18.5,4294,472,18.5,4300,468,18.5,4307,463,18.5,4313,459,18.5,4320,454,18.6,4326,449,18.6,4333,445,18.6,4339,441,18.6,4346,436,18.6,4353,432,18.6,4359,427,18.6,4366,423,18.6,4373,419,18.6,4379,415,18.6,4386,411,18.6,4393,406,18.6,4400,402,18.6,4407,398,18.7,4413,394,18.7,4420,390,18.7,4427,386,18.7,4434,383,18.7,4441,379,18.7,4448,375,18.7,4455,371,18.7,4462,368,18.7,4469,364,18.7,4476,360,18.7,4483,357,18.8,4490,353,18.8,4498,350,18.8,4505,346,18.8,4512,343,18.8,4519,339,18.8,4526,336,18.8,4533,332,18.8,4540,329,18.8,4548,325,18.8,4555,322,18.8,4562,319,18.8,4569,315,18.8,4576,312,18.8] },
  { k: 'ai', p: [6645,566,15,6651,560,15.3,6657,556,15.1,6664,551,15,6671,547,15,6677,542,15.3,6683,536,15.5,6689,531,15.7,6695,526,15.8,6701,520,15.8,6706,515,15.9,6712,509,15.9,6718,504,15.9,6724,498,15.9,6730,493,15.9,6736,487,15.9,6742,482,15.9,6748,477,15.9,6754,471,15.9,6760,466,15.9,6766,461,15.9,6772,455,15.9,6778,450,15.9,6784,445,15.9,6790,440,15.9,6796,435,15.9,6802,429,15.9,6808,424,15.9,6814,419,15.9,6821,414,15.9,6827,409,16,6833,404,16,6839,399,16,6845,394,16,6852,389,16,6858,384,16,6864,379,16,6871,374,16,6877,369,16,6883,364,16,6890,359,16,6896,355,16,6903,350,16,6909,345,16,6915,340,16,6922,336,16,6928,331,16.1,6935,326,16.1,6941,322,16.1,6948,317,16.1,6954,312,16.1,6961,308,16.1,6968,303,16.1,6974,299,16.1,6981,294,16.1,6987,290,16.1,6994,285,16.1,7001,281,16.1,7007,276,16.1,7014,272,16.1,7021,267,16.1,7027,263,16.2,7034,258,16.2,7041,254,16.2,7048,250,16.2,7054,245,16.2,7061,241,16.2,7068,237,16.2,7074,232,16.2,7081,228,16.2,7088,224,16.2,7095,219,16.2,7101,215,16.2] },
  { k: 'ai', p: [7705,89,15,7713,89,16,7721,89,15.8,7729,89,15.6,7737,89,16.1,7745,89,16.5,7753,89,16.7,7761,89,16.8,7769,89,16.9,7777,89,16.9,7785,89,16.9,7793,90,16.9,7800,90,16.8,7808,91,16.9,7816,92,16.8,7824,93,16.8,7832,94,16.8,7840,95,16.8,7848,96,16.8,7856,98,16.8,7863,99,16.8,7871,101,16.8,7879,103,16.7,7886,105,16.7,7894,107,16.7,7902,109,16.7,7909,111,16.7,7917,114,16.6,7925,116,16.6,7932,118,16.6,7940,121,16.6,7947,124,16.6,7955,126,16.6,7962,129,16.6,7970,132,16.6,7977,134,16.6,7984,137,16.6,7992,140,16.6] },
  { k: 'kin', p: [9145,321,13,9153,322,12.6,9161,324,12.3,9169,325,11.9,9177,327,11.5,9184,328,11.1,9192,330,10.8,9200,332,10.4,9208,333,10.1,9216,335,9.9,9224,336,9.7,9232,338,9.5,9240,339,9.4,9247,341,9.2,9255,342,9,9263,344,8.8,9271,345,8.7,9279,347,8.6,9287,348,8.5,9295,350,8.4,9303,351,8.3,9310,353,8.2,9318,354,8.1,9326,356,8,9333,358,7.9,9327,361,7.8,9319,363,7.8,9311,364,7.7,9303,366,7.7,9295,367,7.6,9287,369,7.6,9279,371,7.5,9272,372,7.5,9264,374,7.5,9256,375,7.5,9248,377,7.4,9240,378,7.4,9232,380,7.4,9224,381,7.4,9216,383,7.3,9209,384,7.3,9201,386,7.3,9193,387,7.3,9185,389,7.3,9177,390,7.3,9169,392,7.3,9161,394,7.3,9156,397,7.2,9164,399,7.2,9171,400,7.2,9179,402,7.2,9187,403,7.2,9195,405,7.2,9203,407,7.2,9211,408,7.2,9219,410,7.2,9227,411,7.2,9234,413,7.2,9242,414,7.2,9250,416,7.2,9258,417,7.2,9266,419,7.2,9274,421,7.2,9282,422,7.2,9290,424,7.2,9297,425,7.2,9305,427,7.2,9313,428,7.2,9321,430,7.2,9329,432,7.2,9328,435,7.2,9320,437,7.2,9312,438,7.2,9304,440,7.2,9296,441,7.2,9288,443,7.2,9280,444,7.2,9273,446,7.2,9265,448,7.2,9257,449,7.2,9249,451,7.2,9241,452,7.2,9233,454,7.2,9225,455,7.2,9217,457,7.2,9210,458,7.2,9202,460,7.2,9194,461,7.2,9186,463,7.2,9178,464,7.2,9170,466,7.2,9162,467,7.2,9155,469,7.2,9147,471,7.2] },
  { k: 'kin', p: [9603,320,13,9611,322,13.9,9618,324,14,9626,326,14.2,9633,329,14.5,9641,332,14.7,9648,334,14.7,9655,337,14.7,9663,341,14.7,9670,344,14.7,9677,348,14.7,9684,351,14.6,9690,355,14.6,9697,360,14.5,9704,364,14.5,9710,368,14.5,9717,373,14.4,9723,378,14.4,9729,383,14.3,9735,388,14.3,9741,393,14.2,9747,398,14.2,9753,403,14.2,9759,409,14.2,9765,414,14.1,9771,419,14.1,9776,425,14.1,9782,430,14.1] },
  { k: 'shu', p: [9895,490,17,9903,490,17.8,9911,489,17.6,9919,489,17.4,9927,488,17.5,9935,488,18,9943,487,18.4,9951,487,18.5,9959,487,18.6,9967,486,18.6,9975,486,18.6,9983,485,18.6,9991,485,18.7,9999,484,18.6,10007,484,18.6,10015,484,18.7,10023,483,18.6,10031,483,18.6,10039,483,18.6,10047,482,18.6,10055,482,18.6,10063,482,18.6,10071,482,18.6,10079,481,18.6,10087,481,18.6,10096,481,18.6,10104,481,18.6,10112,481,18.6,10120,481,18.5,10128,481,18.5,10136,481,18.5,10144,481,18.5,10152,481,18.5,10160,481,18.5,10168,481,18.5,10176,481,18.5,10184,482,18.5,10192,482,18.5,10200,482,18.5,10208,482,18.5,10216,483,18.5,10224,483,18.5,10232,483,18.5,10240,484,18.5,10248,484,18.5,10256,484,18.5,10264,485,18.5,10272,485,18.5,10280,486,18.5,10288,486,18.5,10296,487,18.5,10304,488,18.5,10312,488,18.5,10320,489,18.5,10328,490,18.5,10336,490,18.5,10344,491,18.5,10352,492,18.5,10360,493,18.5,10368,493,18.5,10376,494,18.5,10384,495,18.5,10392,496,18.5,10400,497,18.5,10408,498,18.5,10416,499,18.5,10424,499,18.5,10432,500,18.5,10440,501,18.5,10448,502,18.5,10456,503,18.5,10464,504,18.5,10471,505,18.5,10479,506,18.5,10487,507,18.4,10495,508,18.4,10503,509,18.5,10511,510,18.4] },
  { k: 'kin', p: [10081,320,13,10089,321,12.7,10097,323,12.4,10104,324,12.1,10112,325,11.7,10120,326,11.4,10128,328,11.1,10136,329,10.8,10144,330,10.5,10152,331,10.2,10160,333,10,10168,334,9.8,10176,335,9.6,10183,336,9.5,10191,338,9.3,10199,339,9.2,10207,340,9,10215,341,8.9,10223,343,8.7,10231,344,8.6,10239,345,8.5,10247,346,8.4,10255,348,8.3,10262,349,8.3,10270,350,8.2,10278,351,8.1,10286,353,8,10294,354,7.9,10289,357,7.8,10281,358,7.8,10273,359,7.7,10265,361,7.7,10258,362,7.7,10250,363,7.6,10242,364,7.6,10234,366,7.5,10226,367,7.5,10218,368,7.5,10210,370,7.5,10202,371,7.5,10194,372,7.4,10186,373,7.4,10179,375,7.4,10171,376,7.4,10163,377,7.4,10155,378,7.3,10147,380,7.3,10139,381,7.3,10131,382,7.3,10123,383,7.3,10115,385,7.3,10107,386,7.3,10100,387,7.3,10092,388,7.3,10091,391,7.2,10099,393,7.2,10107,394,7.2,10115,395,7.2,10123,397,7.2,10131,398,7.2,10139,399,7.2,10147,400,7.2,10155,402,7.2,10162,403,7.2,10170,404,7.2,10178,405,7.2,10186,407,7.2,10194,408,7.2,10202,409,7.2,10210,410,7.2,10218,412,7.2,10226,413,7.2,10233,414,7.2,10241,415,7.2,10249,417,7.2,10257,418,7.2,10265,419,7.2,10273,420,7.2,10281,422,7.2,10289,423,7.2,10295,426,7.2,10287,427,7.2,10279,429,7.2,10271,430,7.2,10263,431,7.2,10255,432,7.2,10247,434,7.2,10240,435,7.2,10232,436,7.2,10224,437,7.2,10216,439,7.2,10208,440,7.2,10200,441,7.2,10192,442,7.2,10184,444,7.2,10176,445,7.2,10168,446,7.2,10161,447,7.2,10153,449,7.2,10145,450,7.2,10137,451,7.2,10129,452,7.2,10121,454,7.2,10113,455,7.2,10105,456,7.2,10097,457,7.2,10090,459,7.2,10082,460,7.2] },
  { k: 'ai', p: [10795,350,15,10803,350,15.9,10811,349,15.7,10819,349,15.6,10827,348,16,10835,348,16.4,10843,347,16.6,10850,347,16.7,10858,346,16.8,10866,346,16.8,10874,345,16.8,10882,345,16.8,10890,345,16.8,10898,345,16.8,10906,345,16.8,10914,345,16.8,10922,345,16.8,10929,345,16.7,10937,345,16.8,10945,346,16.8,10953,346,16.7,10961,347,16.7,10969,348,16.7,10977,348,16.7,10985,349,16.7,10993,350,16.7,11000,351,16.7,11008,353,16.7,11016,354,16.7,11024,355,16.7,11032,357,16.6,11039,358,16.6,11047,360,16.6,11055,361,16.6,11063,363,16.6,11070,365,16.6,11078,367,16.6,11086,368,16.6,11093,370,16.6,11101,372,16.6,11109,374,16.6,11116,376,16.6,11124,378,16.6,11132,380,16.6] },
  { k: 'shu', p: [11065,508,17,11071,503,17.9,11078,498,17.8,11084,494,17.8,11090,489,18.2,11096,484,18.6,11102,478,18.8,11108,473,18.9,11113,467,18.9,11119,462,19,11125,456,19,11130,451,19,11136,445,19,11142,440,19,11148,434,19,11154,429,19,11160,424,19,11166,419,19,11172,413,19,11178,408,19,11184,403,19,11190,398,19,11196,393,19.1,11202,388,19.1,11208,383,19.1,11215,378,19.1,11221,374,19.1,11227,369,19.1,11234,364,19.1,11240,359,19.1,11246,355,19.1,11253,350,19.2,11259,346,19.2,11266,341,19.2,11273,337,19.2,11279,333,19.2,11286,328,19.2,11293,324,19.2,11299,320,19.3,11306,316,19.3,11313,312,19.3,11320,308,19.3,11326,304,19.3,11333,299,19.3,11340,296,19.3,11347,292,19.3,11354,288,19.3,11361,284,19.3,11368,280,19.3,11375,276,19.3,11381,272,19.3] },
  { k: 'kin', p: [11471,140,13,11479,141,12.6,11487,142,12.2,11494,143,11.8,11502,145,11.5,11510,146,11.1,11518,147,10.7,11526,148,10.3,11534,150,10,11542,151,9.8,11550,152,9.6,11557,153,9.4,11565,154,9.2,11573,155,9,11581,157,8.9,11589,158,8.7,11597,159,8.5,11605,160,8.4,11613,161,8.4,11620,162,8.3,11628,164,8.2,11636,165,8.1,11644,166,8,11639,169,7.8,11631,170,7.8,11623,171,7.7,11616,173,7.7,11608,174,7.6,11600,175,7.6,11592,176,7.5,11584,177,7.5,11576,179,7.5,11568,180,7.4,11561,181,7.4,11553,182,7.4,11545,183,7.4,11537,185,7.3,11529,186,7.3,11521,187,7.3,11513,188,7.3,11505,189,7.3,11498,191,7.3,11490,192,7.3,11482,193,7.3,11481,196,7.2,11489,197,7.2,11497,198,7.2,11505,200,7.2,11513,201,7.2,11521,202,7.2,11529,203,7.2,11537,204,7.2,11544,206,7.2,11552,207,7.2,11560,208,7.2,11568,209,7.2,11576,210,7.2,11584,212,7.2,11592,213,7.2,11599,214,7.2,11607,215,7.2,11615,216,7.2,11623,218,7.2,11631,219,7.2,11639,220,7.2,11645,223,7.2,11637,224,7.2,11629,225,7.2,11621,227,7.2,11613,228,7.2,11605,229,7.2,11598,230,7.2,11590,231,7.2,11582,233,7.2,11574,234,7.2,11566,235,7.2,11558,236,7.2,11550,237,7.2,11543,239,7.2,11535,240,7.2,11527,241,7.2,11519,242,7.2,11511,243,7.2,11503,245,7.2,11495,246,7.2,11487,247,7.2,11480,248,7.2,11472,249,7.2] },
  { k: 'kin', p: [11995,160,13,12003,162,14,12011,163,13.8,12019,165,13.9,12026,167,14.4,12034,169,14.7,12041,172,14.8,12049,174,14.8,12056,177,14.8,12064,181,14.8,12071,184,14.7,12078,188,14.7,12085,192,14.7,12092,196,14.6,12098,200,14.6,12105,204,14.5,12112,209,14.5,12118,214,14.4,12124,219,14.4,12131,224,14.3,12137,229,14.3,12143,234,14.3,12149,239,14.2,12155,244,14.2,12161,249,14.2,12167,255,14.2,12173,260,14.2] },
  { k: 'shu', p: [12405,294,17,12413,296,17.6,12421,297,17.3,12429,298,17,12437,299,16.9,12445,301,17.3,12452,302,17.7,12460,304,17.9,12468,305,18,12476,307,18.1,12484,309,18.1,12492,310,18.1,12499,312,18.1,12507,313,18.1,12515,315,18.2,12523,316,18.1,12531,318,18.1,12539,320,18.1,12546,321,18.1,12554,323,18.1,12562,324,18.1,12570,326,18.1,12578,328,18,12586,329,18.1,12593,331,18.1,12601,333,18,12609,334,18,12617,336,18,12625,338,18,12633,339,18,12640,341,18,12648,342,18,12656,344,18,12664,346,18,12672,348,18,12680,349,18,12687,351,18,12695,353,18,12703,354,18,12711,356,18,12719,358,18,12726,360,18,12734,362,18,12742,363,18,12750,365,18,12757,367,18,12765,369,18,12773,371,18,12781,372,17.9,12789,374,17.9,12796,376,17.9,12804,378,17.9,12812,380,17.9,12820,382,17.9,12827,384,17.9,12835,386,17.9,12843,388,17.9,12851,390,17.9,12859,391,17.9,12866,393,17.9,12874,395,17.9,12882,397,17.9,12889,399,17.9,12897,401,17.9,12905,404,17.9,12913,406,17.9,12920,408,17.9,12928,410,17.9,12936,412,17.9,12944,414,17.9,12951,416,17.9,12959,418,17.9,12967,420,17.9,12974,422,17.9,12982,424,17.9,12990,427,17.9,12998,429,17.9,13005,431,17.9,13013,433,17.9,13021,435,17.9,13028,438,17.9,13036,440,17.9,13044,442,17.9,13051,444,17.9,13059,446,17.9,13067,449,17.9,13074,451,17.9,13082,453,17.9,13090,456,17.9,13097,458,17.9,13105,460,17.9,13113,462,17.9,13120,465,17.9,13128,467,17.8,13136,469,17.8,13143,472,17.9,13151,474,17.9,13159,476,17.9,13166,479,17.8,13174,481,17.9,13182,483,17.9,13189,486,17.8,13197,488,17.8,13204,490,17.8,13212,493,17.8,13220,495,17.9,13227,498,17.9,13235,500,17.8,13243,502,17.8,13250,505,17.8,13258,507,17.8,13265,510,17.8,13273,512,17.8,13281,514,17.8,13288,517,17.8,13296,519,17.8,13304,522,17.8,13311,524,17.8] },
  { k: 'kin', p: [12771,260,13,12778,264,12.6,12785,268,12.2,12792,272,11.8,12799,276,11.5,12806,280,11.1,12813,284,10.7,12820,288,10.3,12827,292,10,12834,295,9.8,12841,299,9.6,12848,303,9.4,12855,307,9.2,12862,311,9,12869,315,8.9,12876,319,8.7,12883,323,8.5,12890,327,8.5,12897,331,8.4,12904,334,8.3,12911,338,8.2,12918,342,8.1,12925,346,8,12925,353,7.8,12918,357,7.8,12911,361,7.7,12904,365,7.7,12898,369,7.6,12891,373,7.6,12884,377,7.6,12877,381,7.5,12870,385,7.5,12863,389,7.5,12856,393,7.4,12849,397,7.4,12842,401,7.4,12835,405,7.4,12828,409,7.3,12821,412,7.3,12814,416,7.3,12807,420,7.3,12800,424,7.3,12793,428,7.3,12786,432,7.3,12779,436,7.3,12772,440,7.2] },
  { k: 'ai', p: [13775,380,15,13783,379,15.9,13791,379,15.7,13799,378,15.5,13807,378,15.9,13815,377,16.4,13823,376,16.6,13830,376,16.7,13838,375,16.8,13846,375,16.8,13854,375,16.8,13862,375,16.8,13870,374,16.8,13878,374,16.8,13886,375,16.8,13894,375,16.7,13902,375,16.8,13910,376,16.7,13917,376,16.7,13925,377,16.7,13933,378,16.7,13941,379,16.7,13949,380,16.7,13957,381,16.7,13964,383,16.7,13972,384,16.6,13980,386,16.6,13988,388,16.6,13995,389,16.6,14003,391,16.6,14011,393,16.6,14019,395,16.6,14026,397,16.6,14034,399,16.6,14041,401,16.5,14049,403,16.6,14057,406,16.5,14064,408,16.5,14072,410,16.5] },
  ],
};

const BACKUP_KEY = 'inkrunner:proof-map-backup';
/** the campaign save as the proof last left it: tells a kept proof save from real progress made since */
const SEEDED_KEY = 'inkrunner:proof-map-seeded';
const ids = () => scrollOrder().map((s) => s.id);

// ─────────────────────────────────────────────────────────────── plausible Summer runs

type Pt = [number, number, number];

/** A hand-painted line: points every 8 units with a slow wobble and the game's width profile. */
function handLine(r: () => number, a: [number, number], b: [number, number], bow: number, w: number, seed: number): Pt[] {
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const n = Math.max(2, Math.round(L / 8));
  const out: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const wob = (noise1(t * 3.2, seed) - 0.5) * 12;
    out.push([
      Math.round(a[0] + (b[0] - a[0]) * t),
      Math.round(a[1] + (b[1] - a[1]) * t - Math.sin(t * Math.PI) * bow + wob),
      Math.round((w + (noise1(t * 5, seed + 1) - 0.5) * 3 + range(r, -0.3, 0.3)) * 10) / 10,
    ]);
  }
  return out;
}

/** A gold zigzag over a yokai, as players scribble it. */
function zigzag(r: () => number, x: number, y: number, seed: number): Pt[] {
  const corners: [number, number][] = [];
  const turns = 4 + Math.floor(r() * 2);
  for (let i = 0; i <= turns; i++) corners.push([x + (i % 2 ? 70 : -70) + range(r, -15, 15), y - 80 + (160 * i) / turns]);
  const out: Pt[] = [];
  for (let i = 0; i + 1 < corners.length; i++) {
    const seg = handLine(r, corners[i], corners[i + 1], 0, 7.2, seed + i);
    out.push(...(i ? seg.slice(1) : seg));
  }
  return out;
}

/** A purple loop, closed with a little overlap, the way a ring gesture ends. */
function loop(r: () => number, cx: number, cy: number, rad: number, seed: number): Pt[] {
  const a0 = range(r, -2.2, -1.2);
  const turn = Math.PI * 2 * range(r, 1.04, 1.1);
  const n = Math.round((turn * rad) / 8);
  const out: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + (turn * i) / n;
    const k = 1 + (noise1(i * 0.2, seed) - 0.5) * 0.16;
    out.push([Math.round(cx + Math.cos(a) * rad * k), Math.round(cy + Math.sin(a) * rad * k * 0.94), Math.round((15 + (noise1(i * 0.3, seed + 3) - 0.5) * 2.4) * 10) / 10]);
  }
  return out;
}

/** A plausible best run on a scroll, from its real geometry. */
export function plausibleRun(level: Level, purple: boolean): MapStroke[] {
  const r = mulberry32(level.id.length * 7919 + Math.round(level.length));
  const out: MapStroke[] = [];
  const add = (k: string, pts: Pt[]) => out.push({ k, p: pts.flat() });
  let seed = 1;
  const isl = [...level.islands].sort((a, b) => a.x0 - b.x0);
  const events: { x: number; f: () => void }[] = [];
  let wide = 0;
  for (let i = 0; i + 1 < isl.length; i++) {
    const a = isl[i];
    const b = isl[i + 1];
    const gap = b.x0 - a.x1;
    if (gap < 160) continue;
    const ya = groundAt(a, a.x1);
    const yb = groundAt(b, b.x0);
    const s = seed++ * 37;
    if (purple && gap > 420 && wide++ % 2 === 0) {
      events.push({ x: a.x1, f: () => { add('murasaki', loop(r, a.x1 - 50, ya - 70, range(r, 46, 62), s)); add('murasaki', loop(r, b.x0 + 90, yb - 70, range(r, 46, 62), s + 5)); } });
    } else {
      events.push({ x: a.x1, f: () => add('shu', handLine(r, [a.x1 - range(r, 20, 60), ya + 6], [b.x0 + range(r, 30, 70), yb + 6], range(r, 8, 26), 17.6, s)) });
    }
  }
  // step-ups inside an island: a ramp (vermilion) or a current (indigo)
  for (const a of isl) {
    for (let k = 1; k < a.pts.length; k++) {
      const p = a.pts[k - 1];
      const q = a.pts[k];
      if (p.y - q.y > 150 && q.x - p.x < 80) {
        const s = seed++ * 41;
        const ink = s % 3 === 0 ? 'ai' : 'shu';
        events.push({ x: p.x, f: () => add(ink, handLine(r, [p.x - range(r, 330, 420), p.y + 6], [q.x + 10, q.y + 4], range(r, -10, 14), ink === 'ai' ? 15.8 : 17.6, s)) });
      }
    }
  }
  for (const y of level.yokai) events.push({ x: y.x - 100, f: () => add('kin', zigzag(r, y.x, y.y, seed++ * 43)) });
  for (const f of level.fires) {
    const s = seed++ * 47;
    events.push({ x: f.x - 160, f: () => add('ai', handLine(r, [f.x - 140, f.y - f.h - 90], [f.x + 160, f.y - f.h - 40], range(r, 4, 16), 15.8, s)) });
  }
  events.sort((m, n) => m.x - n.x).forEach((e) => e.f());
  return out;
}

// ─────────────────────────────────────────────────────────────── the save

function backup() {
  // a backup from an earlier visit stays only while the save is still the one the proof left behind;
  // anything else is the player's own progress since, and that is what must come back
  if (localStorage.getItem(BACKUP_KEY) && localStorage.getItem(CAMPAIGN_KEY) === localStorage.getItem(SEEDED_KEY)) return;
  const keep: Record<string, string> = {};
  for (const k of [CAMPAIGN_KEY, ...ids().map((id) => 'inkrunner:best:' + id)]) {
    const v = localStorage.getItem(k);
    if (v !== null) keep[k] = v;
  }
  localStorage.setItem(BACKUP_KEY, JSON.stringify(keep));
}

function restore() {
  const raw = localStorage.getItem(BACKUP_KEY);
  if (!raw) return;
  for (const k of [CAMPAIGN_KEY, ...ids().map((id) => 'inkrunner:best:' + id)]) localStorage.removeItem(k);
  for (const [k, v] of Object.entries(JSON.parse(raw) as Record<string, string>)) localStorage.setItem(k, v);
  localStorage.removeItem(BACKUP_KEY);
  localStorage.removeItem(SEEDED_KEY);
}

/** Remember what the proof's save looks like now (after seeding, a clear, or the map's own writes). */
function markSeeded() {
  localStorage.setItem(SEEDED_KEY, localStorage.getItem(CAMPAIGN_KEY) ?? '');
}

const GRADES = ['竹', '松', '竹', '梅', '松', '竹'];

/** Clear one campaign scroll the way a finished run does: its best record, then its best strokes. */
function clearScroll(id: string, char: string) {
  const levels = campaignLevels();
  const k = ids().indexOf(id);
  if (id === 'first') {
    localStorage.setItem('inkrunner:best:first', JSON.stringify({ time: FIRST_RUN.time, grade: FIRST_RUN.grade }));
    saveBestStrokes('first', { char: FIRST_RUN.char, time: FIRST_RUN.time, len: FIRST_RUN.len, strokes: FIRST_RUN.strokes });
    return;
  }
  const info = levels.find((l) => l.id === id);
  if (!info) return;
  const level = info.build();
  const time = Math.round((level.parTime || 40) * (1 + k * 0.03) * 100) / 100;
  localStorage.setItem('inkrunner:best:' + id, JSON.stringify({ time, grade: GRADES[k % GRADES.length] }));
  saveBestStrokes(id, { char, time, len: level.length, strokes: plausibleRun(level, true) });
}

/**
 * Wipe the campaign progress and clear the first `n` scrolls of the journey. The Summer ending counts as seen, so a
 * gate cleared here hands straight to the map's paint-in (campaign-path covers the ending's own hand-over).
 */
function seed(n: number, char: string) {
  for (const id of ids()) localStorage.removeItem('inkrunner:best:' + id);
  localStorage.setItem(CAMPAIGN_KEY, JSON.stringify({ v: 1, seen: ['prologue', 'summer-ending'], strokes: {} }));
  for (const id of ids().slice(0, n)) clearScroll(id, char);
  markSeeded();
}

// ─────────────────────────────────────────────────────────────── the page

/**
 * The dev panel: a small tab under the Title button that opens into the controls, so it never sits over the
 * river where the paint-in happens. It folds itself away when a paint-in starts and is hidden while one plays.
 */
const CSS = `
.proof-panel { position: fixed; left: calc(46px + env(safe-area-inset-left)); top: calc(80px + env(safe-area-inset-top)); z-index: 50;
  max-width: min(430px, calc(100vw - 92px)); font: 13px/1.2 system-ui, sans-serif; color: #efe6d3;
  background: rgba(23, 22, 27, 0.86); border-radius: 6px; transition: opacity 0.3s; }
.proof-panel.busy { opacity: 0; pointer-events: none; }
.proof-panel summary { padding: 6px 10px; cursor: pointer; font-weight: 600; list-style: none; user-select: none; }
.proof-panel summary::-webkit-details-marker { display: none; }
.proof-panel summary::before { content: '▸ '; }
.proof-panel[open] summary::before { content: '▾ '; }
.proof-panel .body { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; padding: 0 10px 8px; }
.proof-panel button, .proof-panel select { font: inherit; min-height: 34px; padding: 4px 10px; color: #17161b; background: #efe6d3;
  border: 0; border-radius: 4px; cursor: pointer; }
.proof-panel output { flex-basis: 100%; opacity: 0.8; font-size: 12px; }
@media (max-height: 440px) {
  .proof-panel { left: calc(26px + env(safe-area-inset-left)); top: calc(60px + env(safe-area-inset-top)); max-width: min(420px, calc(100vw - 52px)); font-size: 12px; }
  .proof-panel button, .proof-panel select { min-height: 30px; padding: 3px 8px; }
}
`;

export default async function mapProof({ char, params }: ProofContext) {
  const map = (window as unknown as { __map: CampaignMap }).__map;
  backup();
  const n0 = Math.max(1, Math.min(ids().length, Number(params.get('cleared') ?? 4)));
  seed(n0, char);
  const keep = params.get('keep') === '1';
  // leaving the page puts the real save back (unless the harness asked to keep the seeded one)
  if (!keep) window.addEventListener('pagehide', () => restore());

  // open the map the way a player does: the campaign tab, then a traveler card
  const click = (sel: string) => document.querySelector<HTMLElement>(sel)?.click();
  click('#tab-campaign');
  click(`.card[data-char="${char}"]`);

  const status = () => {
    const done = ids().filter((id) => loadBest(id));
    const sizes = done.map((id) => {
      const rec = JSON.parse(localStorage.getItem(CAMPAIGN_KEY) ?? '{}').strokes?.[id];
      return `${id} ${rec ? (JSON.stringify(rec).length / 1024).toFixed(1) + ' KB' : 'no strokes'}`;
    });
    return `cleared ${done.length}/${ids().length} · ${sizes.join(' · ')}`;
  };

  let refresh = () => {};
  const api = {
    seed: (n: number) => {
      seed(n, char);
      map.open(char, {});
      refresh();
    },
    /** the "Continue the journey" path for the next open scroll: new best, paint-in, then the walk */
    addClear: () => {
      const id = ids().find((x) => !loadBest(x));
      if (!id) return null;
      clearScroll(id, char);
      markSeeded();
      const next = nextScroll(id);
      map.open(char, { focus: id, reveal: next?.id, paint: id });
      refresh();
      return id;
    },
    replay: (id: string) => {
      map.open(char, { focus: id, paint: id });
    },
    status,
  };
  (window as unknown as { __mapProof: typeof api }).__mapProof = api;

  if (params.get('panel') === '0') return;
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  // open on a desktop, folded to its tab on a phone
  const panel = document.createElement('details');
  panel.className = 'proof-panel';
  panel.open = !matchMedia('(pointer: coarse)').matches;
  panel.innerHTML = `<summary>proof: map</summary><div class="body"><select aria-label="Scroll to replay"></select><button data-a="replay">Replay paint-in</button>
    <button data-a="add">Add a clear</button><button data-a="reset">Reset</button>
    <button data-a="s1">1 Summer</button><button data-a="s3">3 Summer</button><button data-a="s5">All Summer</button>
    <button data-a="restore">Restore my save</button><output></output>
    <output class="note">${keep ? 'Your real save is replaced by the seeded one until you press Restore my save.' : 'Your real save is set aside while this page is open and comes back when you leave it.'}</output></div>`;
  document.body.appendChild(panel);
  // out of the way while a paint-in plays
  const busy = () => {
    const q = map.isOpen ? map.inspect().painting : null;
    panel.classList.toggle('busy', !!q && !q.settled);
  };
  setInterval(busy, 150);
  const select = panel.querySelector('select')!;
  const out = panel.querySelector('output:not(.note)')!;
  refresh = () => {
    const done = ids().filter((id) => loadBest(id));
    select.innerHTML = done.map((id) => `<option>${id}</option>`).join('');
    select.value = done[done.length - 1] ?? '';
    out.textContent = status();
  };
  refresh();
  panel.addEventListener('click', (e) => {
    const a = (e.target as HTMLElement).closest('button')?.dataset.a;
    if (a === 'replay' || a === 'add') panel.open = false;
    if (a === 'replay' && select.value) api.replay(select.value);
    else if (a === 'add') api.addClear();
    else if (a === 'reset') api.seed(n0);
    else if (a === 's1') api.seed(2);
    else if (a === 's3') api.seed(4);
    else if (a === 's5') api.seed(ids().length);
    else if (a === 'restore') {
      restore();
      location.href = location.pathname;
    }
  });
  // the panel's own clicks must not pan the map underneath
  panel.addEventListener('pointerdown', (e) => e.stopPropagation());
}
