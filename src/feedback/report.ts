import { z } from 'zod'

/*
 * The report a yaac server forwards from `POST /api/feedback`: the wire
 * contract in bsklaroff/yaac's docs/feedback.md ("What the endpoint
 * receives"). Kinds the contract names as unions (`from.source`,
 * `server.driver`, `client.app.kind`) are read as bounded strings, so a
 * yaac release that adds one still gets its reports through.
 */

const stamp = z.string().max(100).nullable()

const from = z.object({
  source: z.string().max(20),
  email: z.string().max(320),
  name: z.string().max(200),
})

const server = z.object({
  version: stamp,
  gitCommit: stamp,
  buildId: z.string().max(200),
  driver: z.string().max(20),
})

const client = z.object({
  version: stamp,
  gitCommit: stamp,
  userAgent: z.string().max(1000),
  app: z.object({
    kind: z.string().max(20),
    version: stamp,
    build: stamp,
    gitCommit: stamp,
  }).nullable(),
})

export const feedbackReport = z.object({
  message: z.string().trim().min(1).max(10_000),
  images: z.array(z.object({ mimeType: z.string().max(100), data: z.string() })),
  sentAt: z.iso.datetime(),
  from: from.nullable(),
  server,
  client: client.nullable(),
})

export type FeedbackReport = z.infer<typeof feedbackReport>
export type FeedbackFrom = z.infer<typeof from>
export type FeedbackServer = z.infer<typeof server>
export type FeedbackClient = z.infer<typeof client>
