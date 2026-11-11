import { History } from './diagram-history';

describe('History', () => {
  it('começa sem nada para desfazer ou refazer', () => {
    const history = new History<number>();
    expect(history.canUndo).toBeFalse();
    expect(history.canRedo).toBeFalse();
    expect(history.undo(1)).toBeNull();
    expect(history.redo(1)).toBeNull();
  });

  it('desfaz e refaz devolvendo o estado correto', () => {
    const history = new History<string>();
    history.record('A'); // estado antes de virar B
    history.record('B'); // estado antes de virar C
    let current = 'C';

    current = history.undo(current)!;
    expect(current).toBe('B');
    current = history.undo(current)!;
    expect(current).toBe('A');
    expect(history.canUndo).toBeFalse();

    current = history.redo(current)!;
    expect(current).toBe('B');
    current = history.redo(current)!;
    expect(current).toBe('C');
    expect(history.canRedo).toBeFalse();
  });

  it('uma nova alteração descarta o que poderia ser refeito', () => {
    const history = new History<string>();
    history.record('A');
    const afterUndo = history.undo('B');
    expect(afterUndo).toBe('A');
    expect(history.canRedo).toBeTrue();

    history.record('A');
    expect(history.canRedo).toBeFalse();
  });

  it('agrupa alterações consecutivas com a mesma chave em um único passo', () => {
    const history = new History<string>();
    history.record('t0', 'titulo');
    history.record('t1', 'titulo');
    history.record('t2', 'titulo');
    expect(history.undo('t3')).toBe('t0');
    expect(history.canUndo).toBeFalse();
  });

  it('breakGroup e chaves diferentes iniciam novos passos', () => {
    const history = new History<string>();
    history.record('a', 'mover');
    history.breakGroup();
    history.record('b', 'mover');
    history.record('c', 'titulo');
    expect(history.undo('d')).toBe('c');
    expect(history.undo('c')).toBe('b');
    expect(history.undo('b')).toBe('a');
  });

  it('respeita o limite de passos', () => {
    const history = new History<number>(3);
    [1, 2, 3, 4, 5].forEach((n) => history.record(n));
    const seen: number[] = [];
    let current = 6;
    let previous = history.undo(current);
    while (previous !== null) {
      seen.push(previous);
      current = previous;
      previous = history.undo(current);
    }
    expect(seen).toEqual([5, 4, 3]);
  });
});
