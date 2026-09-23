/**
 * Deep structural equality — `equal`'s semantics ("No implicit coercion"
 * in docs-dev/v3-specs/v3-api.md; the `equal` pass in
 * docs-dev/v3-specs/v3-operator-parameters.md): key-order-insensitive for
 * objects, element-wise for arrays, `Date` by time value, `RegExp` by
 * source and flags, `Map`/`Set` by content, typed arrays byte-wise, and a
 * deterministic own-property walk for any other object-typed instance.
 * Cross-type comparisons are `false`, never an error; `NaN` equals `NaN`.
 *
 * The scope is deliberate: the full build, not `dequal/lite`. `Date` and
 * `RegExp` are the opaques that actually arrive in data objects, and their
 * branches are blessed as defined behaviour. Every other non-plain value
 * (`Map`, `Set`, typed arrays, class instances) compares by dequal's rules,
 * which is deterministic but unspecified — equality stays total rather than
 * erroring, and the compiler's opaque-constant rule (what counts as a node)
 * is a different question from what `equal` answers over data.
 *
 * Vendored from `dequal` 2.0.3 (https://github.com/lukeed/dequal) so the
 * package carries no runtime dependency — the semantics are that library's,
 * verbatim, retyped for this codebase.
 *
 * The MIT License (MIT)
 * Copyright (c) Luke Edwards <luke.edwards05@gmail.com> (lukeed.com)
 *
 * Permission is hereby granted, free of charge, to any person obtaining a
 * copy of this software and associated documentation files (the
 * "Software"), to deal in the Software without restriction, including
 * without limitation the rights to use, copy, modify, merge, publish,
 * distribute, sublicense, and/or sell copies of the Software, and to permit
 * persons to whom the Software is furnished to do so, subject to the
 * following conditions:
 *
 * The above copyright notice and this permission notice shall be included
 * in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
 * OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
 * MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
 * IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
 * CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT
 * OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR
 * THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

const has = Object.prototype.hasOwnProperty

/** The key in `iter` that deep-equals `target` (object keys in Maps/Sets). */
const find = (iter: Map<any, any> | Set<any>, target: any): any => {
  for (const key of iter.keys()) {
    if (deepEqual(key, target)) return key
  }
  return undefined
}

export const deepEqual = (foo: any, bar: any): boolean => {
  let ctor: any, len: any, tmp: any
  if (foo === bar) return true

  if (foo && bar && (ctor = foo.constructor) === bar.constructor) {
    if (ctor === Date) return foo.getTime() === bar.getTime()
    if (ctor === RegExp) return foo.toString() === bar.toString()

    if (ctor === Array) {
      if ((len = foo.length) === bar.length) {
        while (len-- && deepEqual(foo[len], bar[len]));
      }
      return len === -1
    }

    if (ctor === Set) {
      if (foo.size !== bar.size) return false
      for (len of foo) {
        tmp = len
        if (tmp && typeof tmp === 'object') {
          tmp = find(bar, tmp)
          if (!tmp) return false
        }
        if (!bar.has(tmp)) return false
      }
      return true
    }

    if (ctor === Map) {
      if (foo.size !== bar.size) return false
      for (len of foo) {
        tmp = len[0]
        if (tmp && typeof tmp === 'object') {
          tmp = find(bar, tmp)
          if (!tmp) return false
        }
        if (!deepEqual(len[1], bar.get(tmp))) return false
      }
      return true
    }

    if (ctor === ArrayBuffer) {
      foo = new Uint8Array(foo)
      bar = new Uint8Array(bar)
    } else if (ctor === DataView) {
      if ((len = foo.byteLength) === bar.byteLength) {
        while (len-- && foo.getInt8(len) === bar.getInt8(len));
      }
      return len === -1
    }

    if (ArrayBuffer.isView(foo)) {
      if ((len = foo.byteLength) === bar.byteLength) {
        while (len-- && (foo as any)[len] === (bar as any)[len]);
      }
      return len === -1
    }

    if (!ctor || typeof foo === 'object') {
      len = 0
      for (ctor in foo) {
        if (has.call(foo, ctor) && ++len && !has.call(bar, ctor)) return false
        if (!(ctor in bar) || !deepEqual(foo[ctor], bar[ctor])) return false
      }
      return Object.keys(bar).length === len
    }
  }

  // NaN equals NaN; everything else that reaches here differs
  return foo !== foo && bar !== bar
}
