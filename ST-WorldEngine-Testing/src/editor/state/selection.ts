export interface SelectionSnapshot {
  selection: string[];
  focused?: string;
}

export interface SelectionChange extends SelectionSnapshot {
  previous: SelectionSnapshot;
}

const cloneSelection = (value: Iterable<string>) => new Set(value);

export class SelectionManager {
  private selection: Set<string>;
  private focused?: string;

  constructor(initialSelection: Iterable<string> = []) {
    this.selection = cloneSelection(initialSelection);
    this.focused = [...this.selection][0];
  }

  getSelection(): string[] {
    return [...this.selection];
  }

  getFocused(): string | undefined {
    return this.focused;
  }

  isSelected(id: string): boolean {
    return this.selection.has(id);
  }

  isFocused(id: string): boolean {
    return this.focused === id;
  }

  setSelection(ids: Iterable<string>, focusLast = true): SelectionChange {
    const previous = this.snapshot();
    this.selection = cloneSelection(ids);
    if (focusLast) {
      this.focused = [...this.selection].pop();
    } else if (this.focused && !this.selection.has(this.focused)) {
      this.focused = [...this.selection][0];
    }
    return this.snapshotChange(previous);
  }

  select(id: string, options: { additive?: boolean; focus?: boolean } = {}): SelectionChange {
    const previous = this.snapshot();
    const { additive = false, focus = true } = options;

    if (!additive) {
      this.selection.clear();
    }

    if (additive && this.selection.has(id)) {
      this.selection.delete(id);
    } else {
      this.selection.add(id);
    }

    if (focus) {
      this.focused = id;
    } else if (this.focused && !this.selection.has(this.focused)) {
      this.focused = [...this.selection][0];
    }

    return this.snapshotChange(previous);
  }

  clear(): SelectionChange {
    const previous = this.snapshot();
    this.selection.clear();
    this.focused = undefined;
    return this.snapshotChange(previous);
  }

  focus(id?: string): SelectionChange {
    const previous = this.snapshot();
    if (id && this.selection.has(id)) {
      this.focused = id;
    } else if (id) {
      this.selection = new Set([id]);
      this.focused = id;
    } else {
      this.focused = [...this.selection][0];
    }

    return this.snapshotChange(previous);
  }

  focusNext(order: string[], direction: 1 | -1 = 1): SelectionChange {
    const previous = this.snapshot();
    if (order.length === 0) {
      this.focused = undefined;
      return this.snapshotChange(previous);
    }

    const currentIndex = this.focused ? order.indexOf(this.focused) : -1;
    const nextIndex = currentIndex === -1 ? 0 : (currentIndex + direction + order.length) % order.length;
    const nextId = order[nextIndex];

    this.selection = new Set([nextId]);
    this.focused = nextId;

    return this.snapshotChange(previous);
  }

  ensureFocused(): string | undefined {
    if (this.focused && this.selection.has(this.focused)) {
      return this.focused;
    }

    const [first] = this.selection;
    this.focused = first;
    return this.focused;
  }

  private snapshot(): SelectionSnapshot {
    return {
      selection: this.getSelection(),
      focused: this.focused,
    };
  }

  private snapshotChange(previous: SelectionSnapshot): SelectionChange {
    return { ...this.snapshot(), previous };
  }
}
