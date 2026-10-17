// Configuration publique. La clé "anon" de Supabase est publique PAR CONCEPTION :
// elle ne donne accès qu'aux fonctions RPC prévues, jamais aux tables.
// Aucun secret ici (le mot de passe admin est haché dans la base).
window.MDL_CONFIG = {
  url: 'https://xonvxicfamjzezsmboan.supabase.co',
  anonKey: 'sb_publishable_6GmeipGQXV_1FyNSpo_6aw_roKRxq-V'
};
// En local (serveur de test), l'API est servie par la même origine.
if (['localhost', '127.0.0.1'].includes(location.hostname)) {
  window.MDL_CONFIG = { url: location.origin, anonKey: 'local' };
}
