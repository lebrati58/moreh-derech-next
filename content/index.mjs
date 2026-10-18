// Banque de questions du trajet Zikhron Ya'akov → Haïfa (route côtière, sans tunnels),
// dans l'ordre géographique du trajet.
import p1 from './part1-zichron.mjs';
import p2 from './part2-coast.mjs';
import p3 from './part3-dor-carmel.mjs';
import p4 from './part4-atlit-haifa.mjs';

export const ROUTE = [...p1, ...p2, ...p3, ...p4].map((q, i) => ({ ...q, sort: i + 1 }));
