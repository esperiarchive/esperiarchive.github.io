/* Verified story controls and local reader history. No game/server state is written. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.StoryRuntime = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const STORAGE_KEY = 'afk-reader-story-choices-v1';
  const clone = value => JSON.parse(JSON.stringify(value));
  class Pending extends Error {}
  const truth = value => value !== false && value !== null && value !== undefined;

  class History {
    constructor(catalog = {}, storage = null) {
      this.catalog = catalog; this.storage = storage; this.records = {}; this.checkpoints = {}; this.storageError = false;
      try {
        const saved = JSON.parse(storage?.getItem(STORAGE_KEY) || 'null');
        if ([1, 2].includes(saved?.version) && saved.records && typeof saved.records === 'object') {
          for (const [id, record] of Object.entries(saved.records)) {
            if (catalog.choices?.[id]?.options.some(o => o.index + 1 === record.option)
                && ['explicit', 'assumed'].includes(record.origin) && Array.isArray(record.dependencies)) {
              this.records[id] = record;
            }
          }
          for (const [id, record] of Object.entries(saved.checkpoints || {})) {
            const definition = catalog.progression?.checkpoints?.[id];
            if (definition && typeof record.completed === 'boolean' && record.origin === 'explicit'
                && Array.isArray(record.dependencies) && record.signature === definition.signature) {
              this.checkpoints[id] = record;
            }
          }
          this.pruneCheckpoints();
        }
      } catch (_) { this.storageError = true; }
    }
    save() {
      try { this.storage?.setItem(STORAGE_KEY, JSON.stringify(this.exportProgression())); }
      catch (_) { this.storageError = true; }
    }
    exportProgression() { return clone({version: 2, records: this.records, checkpoints: this.checkpoints}); }
    snapshot() { return this.exportProgression(); }
    restore(snapshot) {
      this.records = clone(snapshot.version === 2 ? snapshot.records : snapshot);
      this.checkpoints = clone(snapshot.version === 2 ? snapshot.checkpoints || {} : {});
      this.pruneCheckpoints(); this.save();
    }
    dependencyValue(id) {
      return id.startsWith('checkpoint:') ? this.checkpoints[id.slice(11)]?.completed : this.records[id]?.option;
    }
    pruneCheckpoints() {
      const invalid = new Set();
      let changed = true;
      while (changed) {
        changed = false;
        for (const [id, record] of Object.entries(this.checkpoints)) {
          if (!record.basis || record.dependencies.some(dep => this.dependencyValue(dep) !== record.basis[dep])) {
            delete this.checkpoints[id]; invalid.add('checkpoint:' + id); changed = true;
          }
        }
      }
      for (const record of Object.values(this.records)) {
        for (const dep of record.dependencies || []) {
          if (typeof dep === 'string' && dep.startsWith('checkpoint:') && !this.checkpoints[dep.slice(11)]) invalid.add(dep);
        }
      }
      if (invalid.size) this.invalidate([...invalid]);
    }
    invalidate(ids) {
      const invalid = new Set(ids.map(String));
      let changed = true;
      while (changed) {
        changed = false;
        for (const [key, value] of Object.entries(this.records)) {
          if (!invalid.has(key) && value.dependencies.some(dep => invalid.has(String(dep)))) {
            invalid.add(key); changed = true;
          }
        }
        for (const [id, value] of Object.entries(this.checkpoints)) {
          const key = 'checkpoint:' + id;
          if (!invalid.has(key) && value.dependencies.some(dep => invalid.has(String(dep)))) {
            invalid.add(key); changed = true;
          }
        }
      }
      for (const key of invalid) {
        if (key.startsWith('checkpoint:')) delete this.checkpoints[key.slice(11)];
        else delete this.records[key];
      }
      this.save();
    }
    set(id, option, origin = 'explicit', dependencies = []) {
      id = String(id);
      if (!this.catalog.choices?.[id]?.options.some(o => o.index + 1 === option)) throw new Pending('Unknown saved choice.');
      const old = this.records[id];
      if (old && old.option !== option) {
        this.invalidate([id]);
      }
      this.records[id] = {option, origin, dependencies: [...new Set(dependencies.map(String))].filter(dep => dep !== id)};
      this.save();
      return this.records[id];
    }
    setCheckpoint(id, completed, dependencies = []) {
      const definition = this.catalog.progression?.checkpoints?.[id];
      if (!definition || (completed !== null && typeof completed !== 'boolean')) throw new Pending('Unknown reader checkpoint.');
      let record;
      if (completed !== null) {
        dependencies = [...new Set(dependencies.map(String))].filter(dep => dep !== 'checkpoint:' + id);
        const basis = Object.fromEntries(dependencies.map(dep => [dep, this.dependencyValue(dep)]));
        if (Object.values(basis).some(value => value === undefined)) throw new Pending('The checkpoint depends on unresolved earlier progress.');
        record = {completed, origin: 'explicit', dependencies, basis, signature: definition.signature};
      }
      if (JSON.stringify(this.checkpoints[id]) === JSON.stringify(record)) return;
      this.invalidate(['checkpoint:' + id]);
      if (record) this.checkpoints[id] = record;
      this.save();
    }
  }

  class Session {
    constructor(history) { this.history = history; this.catalog = history.catalog; this.reset(); }
    reset() { this.values = {}; this.reads = {}; this.dependencies = new Set(); this.resolving = new Set(); this.readingCheckpoint = null; this.readingChoice = null; }
    useStoryVariant(variant) {
      this.readingCheckpoint = variant?.checkpoint || null;
      this.readingChoice = variant?.standalone || variant?.directReading ? {id: variant.choice, option: variant.option} : null;
    }
    snapshot() { return {values: clone(this.values), reads: clone(this.reads), dependencies: [...this.dependencies],
      ...(this.readingCheckpoint ? {readingCheckpoint: this.readingCheckpoint} : {}),
      ...(this.readingChoice ? {readingChoice: clone(this.readingChoice)} : {})}; }
    restore(value) { this.values = clone(value.values); this.reads = clone(value.reads); this.dependencies = new Set(value.dependencies);
      this.readingCheckpoint = value.readingCheckpoint || null; this.readingChoice = clone(value.readingChoice || null); }
    local(scope) { return this.values[scope] ||= {}; }
    read(scope, name, initial = 0) {
      const values = this.local(scope);
      if (!(name in values)) values[name] = initial;
      return values[name];
    }
    resolve(id) {
      id = String(id);
      // Opening a standalone sibling establishes its entry context only in this
      // session. Do not rewrite the earlier choice or export completion facts.
      if (id === this.readingChoice?.id) return this.readingChoice.option;
      this.dependencies.add(id);
      const definition = this.catalog.choices?.[id];
      if (!definition || this.resolving.has(id)) throw new Pending('An earlier choice cannot yet be resolved.');
      this.resolving.add(id);
      try {
        const saved = this.history.records[id];
        const options = definition.options;
        if (saved) {
          const option = options.find(o => o.index + 1 === saved.option);
          if (!option || !this.eligible({...definition, runtime_scope: definition.asset, runtime_choice: id}, option, true)) {
            throw new Pending('A saved choice is no longer available on this storyline.');
          }
          return saved.option;
        }
        for (const option of options) {
          if (this.eligible({runtime_scope: definition.asset, runtime_choice: id}, option, true)) {
            this.history.set(id, option.index + 1, 'assumed', [...this.dependencies]);
            return option.index + 1;
          }
        }
        throw new Pending('No earlier choice is known to be available.');
      } finally { this.resolving.delete(id); }
    }
    evaluate(node) {
      if (!node) return true;
      if (node.kind === 'any_task_parent') {
        let pending;
        for (const term of node.values) {
          try { if (this.evaluate(term) === true) return true; }
          catch (error) { if (!(error instanceof Pending)) throw error; pending = error; }
        }
        if (pending) throw pending;
        return false;
      }
      if (node.kind === 'literal') return node.value;
      if (node.kind === 'call') {
        const args = node.args.map(arg => {
          if (arg.kind !== 'literal' || !Number.isSafeInteger(arg.value)) throw new Pending('Unsupported story condition argument.');
          return arg.value;
        });
        const score = (id, idx) => {
          const selected = this.resolve(id);
          if (selected !== idx) return 0;
          const rows = (this.catalog.scores || []).filter(r => Number(r.ChoiceID) === id && Number(r.Idx) === idx);
          if (rows.length > 1) throw new Pending('Ambiguous choice score.');
          return rows.length ? Number(rows[0].Score) : 0;
        };
        if (node.name === 'ed.ConditionX.PlotChoiceIDScore' && args.length === 2) return score(...args);
        if (node.name === 'ed.ConditionX.PlotChoiceScore' && args.length === 1) {
          return (this.catalog.scores || []).filter(r => Number(r.PlotID) === args[0])
            .reduce((total, row) => total + score(Number(row.ChoiceID), Number(row.Idx)), 0);
        }
        if (node.name === 'ed.ConditionX.IsExplTaskFinished' && args.length === 2) {
          const id = args.join(':');
          // The selected, verified sibling chapter is a reading context. Its
          // entry boundary also wraps inline cards. Project that boundary only
          // in this view; History and explicit completion remain unchanged.
          if (id === this.readingCheckpoint) return true;
          this.dependencies.add('checkpoint:' + id);
          const record = this.history.checkpoints[id];
          if (!record) throw new Pending('Confirm the earlier reader completion checkpoint to continue.');
          return record.completed;
        }
        throw new Pending('This continuation depends on game state that has not been recovered.');
      }
      if (node.kind === 'unary') {
        const value = this.evaluate(node.value);
        if (node.operator === 'not') return !truth(value);
        if (typeof value !== 'number') throw new Pending('Unsupported story arithmetic.');
        return node.operator === '-' ? -value : value;
      }
      if (node.kind === 'binary') {
        const a = this.evaluate(node.left), op = node.operator;
        if (op === 'and') return truth(a) ? this.evaluate(node.right) : a;
        if (op === 'or') return truth(a) ? a : this.evaluate(node.right);
        const b = this.evaluate(node.right);
        if (op === '==') return a === b;
        if (op === '~=') return a !== b;
        if (typeof a !== 'number' || typeof b !== 'number') throw new Pending('Unsupported story comparison.');
        if (op === '+') return a + b;
        if (op === '-') return a - b;
        if (op === '<') return a < b;
        if (op === '>') return a > b;
        if (op === '<=') return a <= b;
        if (op === '>=') return a >= b;
      }
      throw new Pending(node.reason || 'This story condition is not recovered yet.');
    }
    checkpoint(id, completed) {
      const definition = this.catalog.progression?.checkpoints?.[id];
      if (!definition) throw new Pending('Unknown reader checkpoint.');
      if (completed === null || completed === false) return this.history.setCheckpoint(id, completed);
      if (this.evaluate(definition.guard) !== true) throw new Pending('This checkpoint is unavailable on the selected storyline.');
      for (const source of definition.choice_sources || []) {
        if (this.evaluate(source.guard) === true) this.resolve(source.id);
      }
      return this.history.setCheckpoint(id, completed, [...this.dependencies]);
    }
    eligible(node, option, assuming = false) {
      const seen = this.reads[`${node.runtime_scope}:${node.runtime_choice}`] || [];
      if ((option.display_reads || []).some(idx => !seen.includes(idx))) return false;
      const result = this.evaluate(option.guard);
      if (typeof result !== 'boolean') throw new Pending('A choice condition has no verified Boolean result.');
      return result;
    }
    defaultOption(node) {
      const seen = this.reads[`${node.runtime_scope}:${node.runtime_choice}`] || [];
      // The same unread-topic policy is needed when skipping through an
      // earlier ordinary menu. Evaluate candidates lazily so an unvisited
      // later unknown guard cannot block an available first option.
      if (node.runtime_choice && !node.persistent_choice) {
        const unread=node.options.find(option=>!seen.includes(option.index+1)&&this.eligible(node,option));
        if(unread)return unread;
      }
      return node.options.find(option=>this.eligible(node,option));
    }
    choose(node, option, origin = 'explicit') {
      if (!this.eligible(node, option)) throw new Pending('This choice is not available on the current storyline.');
      const key = `${node.runtime_scope}:${node.runtime_choice}`;
      const seen = this.reads[key] ||= [];
      if (!seen.includes(option.index + 1)) seen.push(option.index + 1);
      if (node.persistent_choice) {
        this.history.set(node.persistent_choice, option.index + 1, origin, [...this.dependencies]);
        this.dependencies.add(String(node.persistent_choice));
      }
    }
    saved(node) {
      const record = this.history.records[node.persistent_choice];
      if (!record) return null;
      const option = node.options.find(o => o.index + 1 === record.option);
      if (!option || !this.eligible(node, option)) throw new Pending('The saved choice is unavailable. Switch the earlier storyline.');
      return {option, origin: record.origin};
    }
    seek(graph, start, target, hiddenOption = () => null, simplifyActivities = true) {
      let current = start;
      const seen = new Set();
      for (let steps = 0; steps < 10000; steps++) {
        if (current === target) return {current, reached: true};
        const node = graph.nodes[current];
        if (!node) return {current: start, stopped: true, notice: 'The requested point is unavailable on this storyline.'};
        const state = JSON.stringify([current, this.values, this.reads, this.history.records]);
        if (seen.has(state)) return {current, stopped: true, notice: 'The requested point is beyond a repeating conversation. Choose how to continue.'};
        seen.add(state);
        try {
          if (node.type === 'inspection') return {current, notice: 'Inspect the points and continue to reach the requested story position.'};
          if (node.type === 'activity') {
            const automatic = simplifyActivities && simpleRetryActivity(graph, node);
            if (!automatic) return {current, notice: 'Choose this activity’s outcome to continue to the requested point.'};
            current = this.activity(node, automatic.input);
            continue;
          }
          if (node.type === 'cycle') return {current, stopped: true, notice: 'The requested point is beyond a repeating conversation. Choose how to continue.'};
          if (node.type === 'runtime') current = this.advance(node).target;
          else if (node.type === 'choice') {
            const saved = node.persistent_choice ? this.saved(node) : null;
            const option = saved?.option || this.defaultOption(node);
            if (!option) throw new Pending('No choice is available before the requested point.');
            if (node.runtime_choice) this.choose(node, option, saved?.origin || 'assumed');
            current = option.target;
          } else if (node.type === 'hidden_branch') {
            const option = hiddenOption(current);
            if (!option) throw new Pending('An unresolved branch precedes the requested point.');
            current = option.target;
          } else if (node.next) current = node.next;
          else return {current, stopped: true, notice: 'The requested point is unavailable on this storyline. Switch an earlier choice to view another path.'};
        } catch (error) {
          if (!(error instanceof Pending)) throw error;
          return {current, stopped: true, notice: error.message};
        }
      }
      return {current, stopped: true, notice: 'Skipping stopped at the story traversal limit.'};
    }
    advance(node) {
      const instruction = node.instruction || {}, scope = node.runtime_scope;
      switch (instruction.op) {
        case 'continue': return {target: node.next};
        case 'object_state_request': {
          const request=instruction.request;
          if(request?.operation!=='set_final_states' || !Array.isArray(request.object_ids)
              || !request.object_ids.length || !request.object_ids.every(id=>Number.isSafeInteger(id)&&id>0))
            throw new Pending('Unresolved NPC state request.');
          // An authored request is not evidence that the world accepted it.
          // Keep it local and rewindable; never write HasState or completion.
          const events=this.local('@object_state_requests').events ||= {};
          events[node.id]=clone(request);
          return {target:node.next};
        }
        case 'fishing_result': return {target:node.next,result:{...instruction.result}};
        case 'reasoning_gate': {
          const caseData = this.catalog.reasoning.cases[instruction.case_id];
          const values = this.local(scope), record = values[instruction.progress_key] ||= {};
          const complete = Object.keys(record).length > 0 && Object.entries(caseData.requirements)
            .every(([id, required]) => !required || (record[id] || []).length === required);
          if (complete) delete values[instruction.progress_key];
          return {target: complete ? node.skip : node.next};
        }
        case 'reasoning_conclusion':
          return {target: node.next, reasoning_conclusion: {case_id: instruction.case_id}};
        case 'constant': return {target: node.options[instruction.value ? 0 : 1]?.target || ''};
        case 'equal': return {target: node.options[this.read(scope, instruction.name, instruction.initial) === instruction.value ? 0 : 1]?.target || ''};
        case 'gate': {
          const value = this.evaluate(instruction.expression);
          if (typeof value !== 'boolean') throw new Pending('Unresolved storyline gate.');
          return {target: value ? node.next : node.skip};
        }
        case 'popup': {
          const item = instruction.parameter?._name ? this.read(scope, instruction.parameter._name) : instruction.value;
          const title = this.read(scope, 'OpenItemTitle', '');
          Object.assign(this.local(scope), instruction.writes);
          return {target: node.next, popup: {item, title, kind: instruction.kind || 'pharmacy'}};
        }
        case 'result':
          Object.assign(this.local(scope), instruction.writes || {});
          return {target: node.next, result: {item: instruction.item, kind: instruction.kind || 'item'}};
        case 'hold': throw new Pending(instruction.reason || 'This activity continuation is not recovered yet.');
        default: throw new Pending('This story control is not supported by the current reader. Reload to update it.');
      }
    }
    activityOptions(node, itemName = id => `Medicine ${id}`, language = 'en') {
      const op = node.instruction.op;
      if (op === 'reasoning') {
        const record = this.local(node.runtime_scope)[node.instruction.progress_key] || {};
        const label = id => {
          const names = this.catalog.reasoning.clues[id].name_i18n;
          return names[language] || names.en || names.cn;
        };
        return node.options.filter(pair => !(record[pair.choice_a] || []).includes(pair.choice_b))
          .map(pair => ({label: `${label(pair.choice_a)} + ${label(pair.choice_b)}`,
            input: {mode: 'pair', a: pair.choice_a, b: pair.choice_b}}));
      }
      if (op === 'alchemy') return [
        {label: 'Succeeded', input: {mode: 'settled', result: true}},
        {label: 'Failed — try again', input: {mode: 'settled', result: false}},
      ];
      if (op === 'treatment') return [
        {label: 'Healed on the first attempt', input: {mode: 'conclude', result: 0}},
        {label: 'Healed on the second attempt', input: {mode: 'conclude', result: 1}},
        {label: 'Treatment unsuccessful', input: {mode: 'conclude', result: 2}},
        ...Object.values(this.catalog.pharmacy.therapy_drugs).map(row => ({
          label: `Brew ${itemName(Number(row.ItemID))}`, input: {mode: 'brew', item_id: Number(row.ItemID)},
        })),
      ];
      if (op === 'pharmacy') {
        const recipe = this.read(node.runtime_scope, 'PharmacyId');
        if (!recipe) return [{label: 'Continue without brewing', input: {mode: 'no_recipe'}}];
        const options = [];
        for (const row of Object.values(this.catalog.pharmacy.pharmacy_pool)) {
          if (Number(row.ID) !== recipe) continue;
          const medicine = row.Medicine.match(/\d+/g).map(Number);
          for (let i = 0; i < medicine.length; i += 2) options.push({
            label: `Received ${itemName(medicine[i])} (result ${row.Order})`,
            input: {mode: 'reward', item_id: medicine[i], order: Number(row.Order)},
          });
        }
        return [...options, {label: 'Close without a reward', input: {mode: 'closed'}}];
      }
      return [];
    }
    activity(node, input) {
      const instruction = node.instruction, scope = node.runtime_scope, values = this.local(scope);
      const allowed = this.activityOptions(node).some(option => JSON.stringify(option.input) === JSON.stringify(input));
      // A load failure is supported for replay/validation but is not a reader choice.
      if (!allowed && !(input?.mode === 'load_failed' && ['alchemy', 'pharmacy'].includes(instruction.op))) throw new Pending('Invalid activity outcome.');
      if (instruction.op === 'reasoning') {
        const pair = node.options.find(pair => pair.choice_a === input.a && pair.choice_b === input.b);
        const record = values[instruction.progress_key] ||= {};
        for (const [a, b] of [[input.a, input.b], [input.b, input.a]]) {
          const partners = record[a] ||= [];
          if (!partners.includes(b)) partners.push(b);
        }
        return pair.target;
      } else if (instruction.op === 'alchemy') {
        this.read(scope, instruction.return_name, instruction.initial);
        values._isPlayFailedAnim = false;
        if (input.mode !== 'load_failed') {
          values[instruction.return_name] = input.result; values._isPlayFailedAnim = !input.result;
        }
      } else if (instruction.op === 'treatment') {
        if (input.mode === 'brew') values.PharmacyId = Number(this.catalog.pharmacy.therapy_drugs[input.item_id].PharmacyID);
        else if (input.mode === 'conclude') values.TreatmentResult = input.result;
        else throw new Pending('Treatment has not completed.');
      } else if (instruction.op === 'pharmacy') {
        this.read(scope, instruction.return_name, instruction.initial);
        const recipe = this.read(scope, 'PharmacyId');
        if (recipe) values.PharmacyId = 0;
        if (input.mode === 'closed') values[instruction.return_name] = false;
        if (input.mode === 'reward') {
          const row = this.catalog.pharmacy.pharmacy_pool[`${recipe}:${input.order}`];
          values[instruction.return_name] = true; values.ItemId = input.item_id; values.OpenItemTitle = row.Result;
        }
      } else throw new Pending('Unsupported activity.');
      return node.next;
    }
  }
  // Admit only a local Boolean retry loop. Its failure path cannot write state,
  // grant an item, show a document, choose a branch, or launch another activity.
  // Shared BlackScene narration is the same presentation template on success.
  // Unknown or substantive failure continuations keep their outcome controls.
  function simpleRetryActivity(graph, node) {
    if (!graph || node?.instruction?.op !== 'alchemy') return null;
    const {return_name: name} = node.instruction, scope = node.runtime_scope;
    if (!name || !scope || !node.id) return null;
    function trace(result) {
      let id = node.next; const seen = new Set(), narration = [];
      for (let count = 0; count < 256; count++) {
        if (id === node.id) return {boundary:'retry', narration};
        if (seen.has(id)) return {boundary:'unknown', narration};
        seen.add(id);const step = graph.nodes[id];
        if (!step) return {boundary:'unknown', narration};
        if (step.type === 'runtime' && step.runtime_scope === scope) {
          const instruction = step.instruction || {};
          if (instruction.op === 'continue') id = step.next;
          else if (instruction.op === 'equal' && instruction.name === name && typeof instruction.value === 'boolean'
              && step.options?.length === 2) id = step.options[result === instruction.value ? 0 : 1].target;
          else return {boundary:result ? 'continuation' : 'unknown', narration};
        } else if (step.type === 'line' && step.entry_kind === 'narration' && step.dialogue_frame_type === 'BlackScene') {
          const text = graph.text_entries?.[step.text_key];
          if (!text?.statementID) return {boundary:'unknown', narration};
          narration.push(String(text.statementID)); id = step.next;
        } else return {boundary:result ? 'continuation' : 'unknown', narration};
      }
      return {boundary:'unknown', narration};
    }
    const failure = trace(false), success = trace(true);
    return failure.boundary === 'retry' && success.boundary === 'continuation'
      && failure.narration.every(id => success.narration.includes(id))
      ? {label:'Completed', input:{mode:'settled', result:true}} : null;
  }

  function choiceDependencies(catalog, ids) {
    const result = new Set(), visiting = new Set();
    function visit(id) {
      id = String(id);
      if (result.has(id) || visiting.has(id) || !catalog.choices?.[id]) return;
      visiting.add(id);
      function inspect(node) {
        if (!node || typeof node !== 'object') return;
        if (node.kind === 'call' && node.args?.[0]?.kind === 'literal') {
          const key = node.args[0].value;
          if (node.name === 'ed.ConditionX.PlotChoiceIDScore') visit(key);
          else if (node.name === 'ed.ConditionX.PlotChoiceScore') {
            for (const row of catalog.scores || []) if (Number(row.PlotID) === key) visit(row.ChoiceID);
          }
        }
        for (const child of Object.values(node)) {
          if (Array.isArray(child)) child.forEach(inspect);
          else if (child && typeof child === 'object') inspect(child);
        }
      }
      for (const option of catalog.choices[id].options) inspect(option.guard);
      visiting.delete(id); result.add(id);
    }
    ids.forEach(visit);
    return result;
  }

  function objectiveGate(catalog, key, prerequisites = []) {
    const entry = catalog.progression?.objective_gates?.[key];
    if (!entry) return null;
    if (entry.kind !== 'verified_choice_prerequisite' || entry.owner !== String(key).split(':')[0]
        || prerequisites.length !== 1 || String(prerequisites[0].line_id) !== entry.prerequisite_line
        || entry.completion_written !== false || !catalog.choices?.[entry.source_choice]
        || entry.reading_gate?.kind !== 'binary' || entry.reading_gate.operator !== '=='
        || entry.reading_gate.left?.name !== 'ed.ConditionX.PlotChoiceScore'
        || JSON.stringify(entry.reading_gate) !== JSON.stringify(entry.native_entry_gate)
        || entry.source_task?.LineID !== entry.owner || entry.source_task.TaskID !== String(key).split(':')[1]
        || entry.source_step?.record_key !== key
        || !new RegExp('\\bPreConditionLine=' + entry.prerequisite_line + '(?:[,}]|$)').test(entry.source_step.ExtraParam)
        || !/^[0-9a-f]{64}$/.test(entry.evidence?.sha256 || '')) {
      throw new Pending('The linked quest condition could not be verified.');
    }
    return entry.reading_gate;
  }

  // A pair of exhaustive quest variants can share a completed predecessor in
  // game data. Selecting a reading route does not assert that task completed.
  // Only admit the bounded shape below: every asset has the same score equality
  // and same checkpoint, the checkpoint names that choice, and all known scores
  // have exactly one sibling story. Keep the original gameplay gates intact.
  class StoryVariants {
    constructor(catalog, stories, {standalone = false, directLine = null} = {}) {
      this.lines = new Map();
      const candidates = new Map();
      const positive = node => node?.kind === 'literal' && Number.isSafeInteger(node.value) && node.value > 0;
      function gateShape(node) {
        const scores = new Map(), checkpoints = new Set();
        function visit(n) {
          if (n?.kind === 'literal' && n.value === true) return true;
          if (n?.kind === 'binary' && n.operator === 'and') return visit(n.left) && visit(n.right);
          if (n?.kind === 'binary' && n.operator === '==' && n.left?.kind === 'call'
              && n.left.name === 'ed.ConditionX.PlotChoiceScore' && n.left.args?.length === 1
              && positive(n.left.args[0]) && n.right?.kind === 'literal' && Number.isSafeInteger(n.right.value)) {
            scores.set(n.left.args[0].value + ':' + n.right.value, n); return true;
          }
          if (n?.kind === 'call' && n.name === 'ed.ConditionX.IsExplTaskFinished'
              && n.args?.length === 2 && n.args.every(positive)) {
            checkpoints.add(n.args.map(a => a.value).join(':')); return true;
          }
          return false;
        }
        if (!visit(node) || scores.size !== 1 || checkpoints.size !== 1) return null;
        const predicate = scores.values().next().value;
        return {predicate, plot: predicate.left.args[0].value, score: predicate.right.value,
          checkpoint: checkpoints.values().next().value};
      }
      for (const story of stories) {
        const line = String(story.id), assets = [...new Set(story.assetKeys || [])];
        const placements = catalog.placements?.[line];
        if (!placements || !assets.length || assets.length !== Object.keys(placements).length) continue;
        const shapes = assets.map(asset => gateShape(placements[asset]?.gate));
        const first = shapes[0];
        if (!first || shapes.some(s => !s || s.plot !== first.plot || s.score !== first.score || s.checkpoint !== first.checkpoint)) continue;
        const rows = (catalog.scores || []).filter(row => Number(row.PlotID) === first.plot);
        const choices = new Set(rows.map(row => String(row.ChoiceID)));
        if (choices.size !== 1) continue;
        const choice = [...choices][0], definition = catalog.choices?.[choice];
        if (!definition || !catalog.progression?.checkpoints?.[first.checkpoint]?.choice_sources?.some(s => s.id === choice)) continue;
        // A standalone entry may project only an unconditional upstream choice.
        // Conditional endings still use the normal shared progression route.
        if (standalone && definition.options.some(o => o.guard?.kind !== 'literal' || o.guard.value !== true
            || (o.display_reads || []).length)) continue;
        const scores = definition.options.map(option => rows.filter(row => Number(row.Idx) === option.index + 1));
        if (scores.some(matches => matches.length !== 1 || !Number.isSafeInteger(Number(matches[0].Score)))) continue;
        const values = scores.map(matches => Number(matches[0].Score));
        if (values.length < 2 || new Set(values).size !== values.length || !values.includes(first.score)) continue;
        const key = first.plot + '/' + first.checkpoint;
        const group = candidates.get(key) || {members: [], values};
        group.members.push({...first, line, choice, standalone,
          option: definition.options[values.indexOf(first.score)].index + 1, assets: new Set(assets)}); candidates.set(key, group);
      }
      for (const group of candidates.values()) {
        if (group.members.length !== group.values.length
            || new Set(group.members.map(m => m.score)).size !== group.values.length
            || !group.values.every(value => group.members.some(m => m.score === value))) continue;
        const direct = group.members.some(m => m.line === String(directLine)) && group.members.every(member => {
          const entry = catalog.progression?.reading_entries?.[member.line];
          return entry?.kind === 'verified_entry_only_ending' && entry.line === member.line
            && entry.choice === member.choice && entry.option === member.option && entry.checkpoint === member.checkpoint
            && entry.internal_progression_consumers === 0 && entry.server_completion_written === false
            && JSON.stringify(entry.native_choice_guards) === JSON.stringify(catalog.choices[member.choice].options.map(o => o.guard));
        });
        for (const member of group.members) this.lines.set(member.line, {...member, group,
          ...(direct ? {directReading:true,readingLine:String(directLine)} : {})});
      }
    }
    get(line) { return this.lines.get(String(line)); }
    selectedLine(line, session) {
      const variant = this.get(line);
      if (!variant) return String(line);
      if (variant.directReading) return variant.readingLine;
      if (variant.standalone) return String(line);
      const available = variant.group.members.filter(member => session.evaluate(member.predicate) === true);
      if (available.length !== 1) throw new Pending('The selected story route cannot yet be resolved.');
      return available[0].line;
    }
    visible(line, session) {
      try { return this.selectedLine(line, session) === String(line); }
      catch (error) { if (!(error instanceof Pending)) throw error; return true; }
    }
    readingGate(line, asset, gameplayGate) {
      const variant = this.get(line);
      if (variant?.directReading && variant.assets.has(asset)) return {kind:'literal',value:variant.line === variant.readingLine};
      return variant?.assets.has(asset) ? variant.standalone ? {kind: 'literal', value: true} : variant.predicate : gameplayGate;
    }
  }

  // Full Script and Debug share one changeable route, including local dialogue
  // choices. Local selections never create persistent progression records.
  class FullScriptRoute {
    constructor(history, overrides = {}) {
      this.session = new Session(history);
      this.overrides = overrides;
      this.controls = [];
      this.occurrences = {};
      this.revision = 0;
      this.halted = false;
    }
    control(node, nodeKey, type) {
      const occurrence = this.occurrences[nodeKey] || 0;
      this.occurrences[nodeKey] = occurrence + 1;
      return {node, nodeKey, type, occurrence, key: JSON.stringify([nodeKey, occurrence]),
        index: this.controls.length, runtimeBefore: this.session.snapshot()};
    }
    activity(node, nodeKey, itemName, language = 'en', readingGraph = null) {
      const control = this.control(node, nodeKey, 'activity');
      const automatic = simpleRetryActivity(readingGraph, node);
      const options = automatic ? [automatic] : this.session.activityOptions(node, itemName, language);
      if (automatic) delete this.overrides[control.key];
      const override = this.overrides[control.key];
      const outcome = override && options.find(option => JSON.stringify(option.input) === JSON.stringify(override));
      if (override && !outcome) delete this.overrides[control.key];
      control.outcome = outcome || options[0];
      control.automatic = Boolean(automatic);
      control.assumed = !automatic && !outcome;
      if (!control.outcome) throw new Pending('This activity has no recovered outcome.');
      control.target = this.session.activity(node, control.outcome.input);
      this.controls.push(control);
      this.revision++;
      return control;
    }
    choice(node, nodeKey, topicIndices = []) {
      node = {...node, runtime_scope: node.runtime_scope || '@full-script',
        runtime_choice: node.runtime_choice || nodeKey,
        options: node.options.map((option, index) => ({...option, index: option.index ?? index}))};
      const control = this.control(node, nodeKey, 'choice');
      const saved = node.persistent_choice ? this.session.saved(node) : null;
      const override = this.overrides[control.key];
      let option = saved?.option || node.options.find(option => option.index === override);
      if (option && !this.session.eligible(node, option)) option = null;
      // Read returning topics before the exit, even when the exit is first in
      // the authored button order. Keep that button order unchanged in the UI.
      const ordered = node.persistent_choice || !topicIndices.length ? node.options
        : [...node.options.filter(option => topicIndices.includes(option.index)),
          ...node.options.filter(option => !topicIndices.includes(option.index))];
      const seen = this.session.reads[`${node.runtime_scope}:${node.runtime_choice}`] || [];
      const candidates = node.persistent_choice ? ordered : ordered.filter(option =>
        !topicIndices.includes(option.index) || !seen.includes(option.index + 1));
      option ||= this.session.defaultOption({...node, options: candidates});
      if (!option) throw new Pending('No choice is available on this storyline.');
      control.origin = saved?.origin || (option.index === override ? 'explicit' : 'assumed');
      this.session.choose(node, option, control.origin);
      control.option = option;
      control.target = option.target;
      this.controls.push(control);
      this.revision++;
      return control;
    }
    select(control, value) {
      if (control.type === 'activity' && JSON.stringify(control.outcome.input) === JSON.stringify(value.input)) return;
      const check = new Session(this.session.history);
      check.restore(control.runtimeBefore);
      if (control.type === 'activity') check.activity(control.node, value.input);
      else if (!check.eligible(control.node, value)) throw new Pending('This choice is not available.');
      const later = this.controls.slice(control.index + 1);
      this.session.history.invalidate(later.map(entry => entry.node.persistent_choice).filter(Boolean));
      for (const entry of later) delete this.overrides[entry.key];
      if (control.type === 'choice' && control.node.persistent_choice) check.choose(control.node, value, 'explicit');
      else this.overrides[control.key] = control.type === 'activity' ? value.input : value.index;
    }
  }
  return {History, Session, FullScriptRoute, StoryVariants, objectiveGate, choiceDependencies, simpleRetryActivity, Pending, STORAGE_KEY};
});
