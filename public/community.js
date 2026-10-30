// Moreh Derech NEXT : bibliothèque partagée des documents de parcours.
// Toutes les données viennent des RPC Supabase. Aucune écriture locale trompeuse.
(function (root) {
  'use strict';
  const rpc = (...args) => root.MDL.rpc(...args);
  const list = async () => {
    const r = await rpc('community_catalog', {}, { timeout: 12000 });
    if (!r || !Array.isArray(r.documents) || !Array.isArray(r.routes)) throw new Error('community_not_ready');
    return r;
  };
  const submit = async data => {
    const r = await rpc('community_submit_document', data, { timeout: 25000 });
    if (!r || !r.ok) throw new Error(r && r.error || 'community_save_failed');
    return r;
  };
  const read = async id => {
    const r = await rpc('community_document', { p_id: id }, { timeout: 12000 });
    if (!r || r.error) throw new Error(r && r.error || 'not_found');
    return r;
  };
  root.MDCommunity = { list, submit, read };
})(window);
