import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'
import { DataSource } from 'typeorm'
import { EvidenceRecheckService } from './fit/evidence-recheck.service'
import { InboundLaneService } from './inbound/inbound-lane.service'
import { RepliesService } from './inbox/replies.service'
import { JobsService } from './jobs/jobs.service'
import { SandboxReplier } from './sandbox/sandbox-replier'
import { SandboxReload } from './sandbox/sandbox-reset'
import { loadSandboxScript } from './sandbox/sandbox-script'
import { FakeXClient } from './x/fake-x-client'
import { X_CLIENT } from './x/x-client'
import { recordHeartbeat } from './preflight/preflight.service'
import { RetentionService } from './retention/retention.service'
import { Worker } from './sending/worker'

const SWEEP_EVERY_MS = 3_600_000
const REPLY_SCHEDULE_EVERY_MS = 60_000
const HEARTBEAT_EVERY_MS = 15_000
const INBOUND_SCHEDULE_EVERY_MS = 60_000
const RELOAD_EVERY_MS = 5_000

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule)
  const retention = app.get(RetentionService)
  const sweep = () => retention.sweep(new Date()).catch((err: unknown) => console.error('retention sweep failed', err))
  void sweep()
  setInterval(() => void sweep(), SWEEP_EVERY_MS)
  const replies = app.get(RepliesService)
  const scheduleReplies = () => replies.scheduleNext(new Date()).catch((err: unknown) => console.error('reply schedule failed', err))
  setInterval(() => void scheduleReplies(), REPLY_SCHEDULE_EVERY_MS)
  const inbound = app.get(InboundLaneService)
  const scheduleInbound = () => inbound.scheduleChecks(new Date()).catch((err: unknown) => console.error('inbound schedule failed', err))
  void scheduleInbound()
  setInterval(() => void scheduleInbound(), INBOUND_SCHEDULE_EVERY_MS)
  const evidence = app.get(EvidenceRecheckService)
  const scheduleEvidence = () => evidence.scheduleDaily(new Date()).catch((err: unknown) => console.error('evidence schedule failed', err))
  void scheduleEvidence()
  setInterval(() => void scheduleEvidence(), SWEEP_EVERY_MS)
  const ds = app.get(DataSource)
  const x = app.get(X_CLIENT)
  if (x instanceof FakeXClient) {
    const reload = new SandboxReload(ds, x)
    setInterval(() => void reload.check().then((done) => done && console.log('sandbox reset seen: fake X fixtures reloaded')).catch((err: unknown) => console.error('sandbox reload failed', err)), RELOAD_EVERY_MS)
    if (process.env.SANDBOX_SCRIPT === '1') {
      const replier = new SandboxReplier(ds, x, loadSandboxScript(), app.get(JobsService))
      setInterval(() => void replier.tick(new Date()).catch((err: unknown) => console.error('sandbox replies failed', err)), RELOAD_EVERY_MS)
    }
  }
  const beat = () => recordHeartbeat(ds, new Date()).catch((err: unknown) => console.error('heartbeat failed', err))
  void beat()
  setInterval(() => void beat(), HEARTBEAT_EVERY_MS)
  await app.get(Worker).run()
}

void bootstrap()
