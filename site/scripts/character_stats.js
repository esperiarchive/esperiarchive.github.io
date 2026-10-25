(function (root) {
  "use strict";
  function project(unit, main, quality, seasonal = null, includePveGrowth = false, normalEquipment = null) {
    if (!unit || !main || !quality) throw new Error("A main-level row and quality are required.");
    const rows = seasonal ? [main, seasonal] : [main];
    const factor = rows.reduce((sum, row) => sum + Number(row.base_factor || 0)
      + (includePveGrowth ? Number(row.pve_mode_add_base || 0) : 0), 0);
    const values = {};
    for (const field of ["HP", "ATK", "ARM", "MR"]) {
      values[field] = Number(unit.base_values[field] || 0) * Number(unit.attribute_increase_ratio ?? 1)
        * factor * Number(quality.multipliers[field] ?? 1) + Number(quality.flat_adds[field] || 0);
    }
    const secondary = unit.secondary_base_values || {};
    values.PRFC = Number(secondary.PRFC || 0) + Number(quality.proficiency_add || 0)
      + rows.reduce((sum, row) => sum + Number(row.proficiency_add || 0), 0);
    values.CRIT = Number(secondary.CRIT || 0)
      + rows.reduce((sum, row) => sum + Number(row.crit_add || 0), 0);
    for (const [field, addition] of Object.entries(normalEquipment?.values || {})) {
      if (Object.hasOwn(values, field)) values[field] += Number(addition || 0);
    }
    return values;
  }
  function levelBounds(progression, seasonalOffset = 240) {
    const seasonal = progression.key === "episode";
    return {
      min: seasonal ? seasonalOffset : Number(progression.min_level),
      max: Math.min(Number(progression.max_level) + (seasonal ? seasonalOffset : 0), 1800),
    };
  }
  function growthRow(progression, displayedLevel, seasonalOffset = 240) {
    const internalLevel = Number(displayedLevel) - (progression.key === "episode" ? seasonalOffset : 0);
    if (progression.key === "episode" && internalLevel === 0) {
      return {level: 0, base_factor: "0", proficiency_add: "0", crit_add: "0", pve_mode_add_base: "0"};
    }
    return (progression.levels || []).find(row => Number(row.level) === internalLevel) || null;
  }
  const api = { project, levelBounds, growthRow };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.CharacterStats = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
