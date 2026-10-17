-- Questions de DÉMONSTRATION (optionnel). Elles servent uniquement à tester
-- le fonctionnement du jeu. Les réponses NE SONT PAS des faits validés :
-- à vérifier ou remplacer par le guide avant le 21 octobre.
-- Ajoutées seulement si la banque de questions est vide (ré-exécution sans doublons).
insert into mdl.questions (kind, text, options, correct_index, explanation, category, difficulty, time_limit_sec, sort_order, is_demo)
select v.kind, v.text, v.options::jsonb, v.correct_index, v.explanation, v.category, v.difficulty, v.time_limit_sec, v.sort_order, true
from (values
('mcq', '[הדגמה] מימין לאוטובוס אנחנו רואים גבעה. מאיזה סוג סלע היא בנויה?',
 '["גיר","בזלת","גרניט","חול"]', 0,
 'שאלת הדגמה בלבד — התשובה לא אומתה. יש לעדכן לפני הסיור.', 'גאולוגיה', 2, 30, 1),
('mcq', '[הדגמה] איזה מבצר צלבני נמצא על החוף ליד עתלית?',
 '["מבצר עתלית (שאטו פלרן)","מבצר נמרוד","כוכב הירדן","מבצר יחיעם"]', 0,
 'שאלת הדגמה בלבד — יש לאמת את התשובה וההסבר.', 'היסטוריה', 2, 30, 2),
('tf', '[הדגמה] כביש 2 נקרא גם "כביש החוף".',
 '["נכון","לא נכון"]', 0,
 'שאלת הדגמה בלבד — יש לאמת.', 'גאוגרפיה', 1, 20, 3),
('mcq', '[הדגמה] איזה רכס נראה משמאל לאוטובוס בנסיעה צפונה לחיפה?',
 '["הכרמל","הגלבוע","החרמון","רמת מנשה"]', 0,
 'שאלת הדגמה בלבד — יש לאמת.', 'גאוגרפיה', 1, null::int, 4)
) as v(kind, text, options, correct_index, explanation, category, difficulty, time_limit_sec, sort_order)
where not exists (select 1 from mdl.questions);
