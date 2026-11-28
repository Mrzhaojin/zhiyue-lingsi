-- M2 / seed：公版书种子数据（可重复执行）
-- 版权说明：仅收录已进入公有领域的作品，source 字段标注许可与署名。

insert into public.tags (id, name, icon) values
  ('tag-classic', '#经典', '📖'),
  ('tag-english', '#英文原著', '🌍'),
  ('tag-essay', '#散文', '✍️')
on conflict (id) do nothing;

insert into public.books (id, title, author, category, difficulty, summary, recommended_heat, ai_reason, language, source) values
  (
    'book-hongloumeng',
    '红楼梦',
    '曹雪芹',
    '小说',
    '进阶',
    '中国古典长篇章回小说，以贾府兴衰写人情世态。此处仅收录公版开篇片段，用于阅读与赏析演示。',
    980,
    '适合练习人物关系梳理与叙事视角分析。',
    'zh',
    '{"type":"public-domain","title":"红楼梦","license":"public-domain","attribution":"曹雪芹（清）"}'::jsonb
  ),
  (
    'book-gatsby',
    'The Great Gatsby',
    'F. Scott Fitzgerald',
    '英文原著',
    '中级',
    '美国爵士时代的短篇长篇，以 Nick 的视角观察 Gatsby 的执念。英文公版，适合精读与长难句拆解。',
    860,
    '适合英文长句拆解与第一人称叙事分析。',
    'en',
    '{"type":"public-domain","title":"The Great Gatsby","license":"public-domain","attribution":"F. Scott Fitzgerald"}'::jsonb
  ),
  (
    'book-kuangren',
    '狂人日记',
    '鲁迅',
    '小说',
    '中级',
    '《呐喊》中的第一篇白话小说，以“狂人”视角写礼教与恐惧。鲁迅作品已进入公有领域。',
    900,
    '适合练习叙述者可靠性与象征解读。',
    'zh',
    '{"type":"public-domain","title":"狂人日记","license":"public-domain","attribution":"鲁迅"}'::jsonb
  )
on conflict (id) do nothing;

insert into public.chapters (id, book_id, ordinal, title, content) values
  (
    'chapter-hongloumeng-1',
    'book-hongloumeng',
    0,
    '第一回 甄士隐梦幻识通灵 贾雨村风尘怀闺秀',
    '此开卷第一回也。作者自云：因曾历过一番梦幻之后，故将真事隐去，而借“通灵”之说，撰此《石头记》一书也。故曰“甄士隐”云云。但书中所记何事何人？自又云：“今风尘碌碌，一事无成，忽念及当日所有之女子，一一细考较去，觉其行止见识，皆出于我之上。”'
  ),
  (
    'chapter-gatsby-1',
    'book-gatsby',
    0,
    'Chapter 1',
    'In my younger and more vulnerable years my father gave me some advice that I have been turning over in my mind ever since. “Whenever you feel like criticizing any one,” he told me, “just remember that all the people in this world have not had the advantages that you have had.”'
  ),
  (
    'chapter-kuangren-1',
    'book-kuangren',
    0,
    '一',
    '今天晚上，很好的月光。我不见他，已是三十多年；今天见了，精神分外爽快。才知道以前的三十多年，全是发昏；然而须十分小心。不然，那赵家的狗，何以看我两眼呢？我怕得有理。'
  )
on conflict (id) do nothing;

-- 校验
select
  (select count(*) from public.books) as books,
  (select count(*) from public.chapters) as chapters,
  (select count(*) from public.tags) as tags;
