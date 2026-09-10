// Accesseur de RegExp mémoïsé par clé - évite de recompiler à chaque appel sur un même document.
export function memoizedRegex(build: (key: string) => RegExp): (key: string) => RegExp {
  const cache = new Map<string, RegExp>();
  return (key: string) => {
    let re = cache.get(key);
    if (!re) {
      re = build(key);
      cache.set(key, re);
    }
    return re;
  };
}
