import test from 'node:test'
import assert from 'node:assert/strict'

import {
  loadRuntimeAssetBytes,
  parseTinyGoRuntimePackIndex,
} from '../src/runtime-assets.ts'

test('parseTinyGoRuntimePackIndex validates the index payload', () => {
  const index = parseTinyGoRuntimePackIndex({
    format: 'wasm-tinygo-runtime-pack-index-v1',
    fileCount: 1,
    totalBytes: 3,
    entries: [
      {
        runtimePath: 'tools/go-probe.wasm',
        offset: 0,
        length: 3,
      },
    ],
  })

  assert.equal(index.fileCount, 1)
  assert.equal(index.entries[0].runtimePath, 'tools/go-probe.wasm')
})

test('loadRuntimeAssetBytes returns packed runtime assets before hitting the network', async () => {
  const packBytes = new Uint8Array([1, 2, 3, 4])
  const packIndex = {
    format: 'wasm-tinygo-runtime-pack-index-v1',
    fileCount: 1,
    totalBytes: 4,
    entries: [
      {
        runtimePath: 'tools/go-probe.wasm',
        offset: 0,
        length: 4,
      },
    ],
  }
  const requests = []
  const fetchImpl = async (url) => {
    requests.push(String(url))
    if (String(url).endsWith('pack.index.json')) {
      return new Response(JSON.stringify(packIndex))
    }
    if (String(url).endsWith('pack.bin')) {
      return new Response(packBytes)
    }
    throw new Error(`unexpected fetch ${url}`)
  }

  const bytes = await loadRuntimeAssetBytes({
    assetPath: 'tools/go-probe.wasm',
    assetUrl: 'http://assets.invalid/tools/go-probe.wasm',
    assetBaseUrl: 'http://assets.invalid/',
    label: 'go-probe.wasm',
    packs: [
      {
        index: 'pack.index.json',
        asset: 'pack.bin',
        fileCount: 1,
        totalBytes: 4,
      },
    ],
    fetchImpl,
  })

  assert.deepEqual([...bytes], [1, 2, 3, 4])
  assert.deepEqual(requests, [
    'http://assets.invalid/pack.index.json',
    'http://assets.invalid/pack.bin',
  ])
})

test('loadRuntimeAssetBytes respects loader overrides', async () => {
  let fetchedUrl = null
  const fetchImpl = async (url) => {
    fetchedUrl = String(url)
    return new Response(new Uint8Array([9, 9]))
  }

  const bytes = await loadRuntimeAssetBytes({
    assetPath: 'tools/go-probe.wasm',
    assetUrl: 'http://assets.invalid/tools/go-probe.wasm',
    assetBaseUrl: 'http://assets.invalid/',
    label: 'go-probe.wasm',
    loader: async () => 'http://assets.invalid/override/go-probe.wasm',
    fetchImpl,
  })

  assert.deepEqual([...bytes], [9, 9])
  assert.equal(fetchedUrl, 'http://assets.invalid/override/go-probe.wasm')
})

test('loadRuntimeAssetBytes accepts loader-provided bytes without fetching', async () => {
  let fetched = false
  const fetchImpl = async () => {
    fetched = true
    return new Response(new Uint8Array([1]))
  }

  const bytes = await loadRuntimeAssetBytes({
    assetPath: 'tools/go-probe.wasm',
    assetUrl: 'http://assets.invalid/tools/go-probe.wasm',
    assetBaseUrl: 'http://assets.invalid/',
    label: 'go-probe.wasm',
    loader: async () => new Uint8Array([7, 8, 9]),
    fetchImpl,
  })

  assert.deepEqual([...bytes], [7, 8, 9])
  assert.equal(fetched, false)
})
