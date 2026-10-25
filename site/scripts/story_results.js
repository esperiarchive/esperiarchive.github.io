(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.StoryResults = api;
})(typeof globalThis === 'object' ? globalThis : this, function() {
  const STORAGE_KEY = 'afk-reader-possible-catches-v1';
  // Cosmetic catches are separate from choices that affect story state.
  class CatchSelections {
    constructor(storage) {
      this.storage = storage;
      this.values = {};
      try {
        const value = JSON.parse(storage?.getItem(STORAGE_KEY) || '{}');
        if (value && typeof value === 'object' && !Array.isArray(value)) this.values = value;
      } catch (_) { /* An unavailable store still permits a stable session. */ }
    }
    options(plan) {
      return plan?.kind === 'variable'
        ? [...new Set((plan.pool || []).filter(id => /^\d+$/.test(String(id)) && Number(id) > 0).map(String))] : [];
    }
    choose(key, plan, fish) {
      if (!this.options(plan).includes(String(fish))) return false;
      this.values[key] = String(fish);
      try { this.storage?.setItem(STORAGE_KEY, JSON.stringify(this.values)); } catch (_) {}
      return true;
    }
    results(key, plan) {
      if (!plan) return [];
      if (plan.kind === 'scripted' && plan.fish?.length && plan.fish.every(id => Number(id) > 0)) {
        return plan.fish.map((fish, index) => ({kind:'fishing', fish:String(fish), key:`${key}:${index}`,
          sequence:plan.fish.length > 1 ? `Catch ${index + 1} of ${plan.fish.length}` : ''}));
      }
      const pool = this.options(plan);
      if (pool.length) {
        const fish = pool.includes(this.values[key]) ? this.values[key] : pool[0];
        return [{kind:'fishing', fish, key, possible:true, pool}];
      }
      return [{kind:'fishing', key, unknown:true}];
    }
  }
  function fromProgress(progress, nodeId) {
    if (progress?.reasoning_conclusion) return {type:'reasoning_conclusion', nodeId,
      caseId:progress.reasoning_conclusion.case_id};
    const result = progress?.result || progress?.popup;
    if(result?.kind==='fishing' && Number.isSafeInteger(Number(result.fish)) && Number(result.fish)>0)
      return {type:'activity_result',nodeId,result:{...result,fish:String(result.fish)}};
    if (!result || result.kind === 'document' || !Number.isSafeInteger(Number(result.item)) || Number(result.item) <= 0) return null;
    return {type:'activity_result', nodeId, result:{kind:result.kind || 'item', item:String(result.item)}};
  }
  return {CatchSelections, fromProgress, STORAGE_KEY};
});
