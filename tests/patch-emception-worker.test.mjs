import test from 'node:test'
import assert from 'node:assert/strict'

import { patchEmceptionWorkerSource } from '../scripts/patch-emception-worker-source.mjs'

test('patchEmceptionWorkerSource injects fixed public path, init patch, and mkdir wrapper', () => {
  const source = [
    'before',
    'if(!e)throw new Error("Automatic publicPath is not supported in this browser");e=e.replace(/#.*$/,"").replace(/\\?.*$/,"").replace(/\\/[^\\/]+$/,"/"),__webpack_require__.p=e',
    'middle',
    'this.ready=this.#e(e,r,{onrunprocess:t,...a});',
    'after',
    'globalThis.emception=Hn,i(Hn)',
  ].join('\n')

  const patched = patchEmceptionWorkerSource(source)

  assert.match(patched, /__webpack_require__\.p="https:\/\/jprendes\.github\.io\/emception\/"/)
  assert.ok(!patched.includes('Automatic publicPath is not supported in this browser'))
  assert.ok(patched.includes('this.ready=this.#e(e,r,a);'))
  assert.ok(patched.includes('Hn.mkdir=async e=>{await Hn.fileSystem.mkdir(e)};globalThis.emception=Hn,i(Hn)'))
})

test('patchEmceptionWorkerSource rejects unknown worker layouts', () => {
  assert.throws(() => patchEmceptionWorkerSource('globalThis.emception=Hn,i(Hn)'), /format changed/)
})
