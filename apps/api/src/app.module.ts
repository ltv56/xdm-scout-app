import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { TypeOrmModule } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'
import { KnownListController } from './known/known-list.controller'
import { HandleExtractor } from './known/handle-extract'
import { KnownListService } from './known/known-list.service'
import { DoNotContactController } from './dnc/do-not-contact.controller'
import { DoNotContactService } from './dnc/do-not-contact.service'
import { ActivityController } from './activity/activity.controller'
import { ActivityService } from './activity/activity.service'
import { AttentionController } from './attention/attention.controller'
import { AttentionService } from './attention/attention.service'
import { HealthDetailsController, PreflightController, TopBarController } from './preflight/preflight.controller'
import { FunnelController } from './funnel/funnel.controller'
import { FunnelService } from './funnel/funnel.service'
import { InboundLaneController } from './inbound/inbound-lane.controller'
import { InboundLaneService } from './inbound/inbound-lane.service'
import { OutboxController } from './outbox/outbox.controller'
import { OutboxService } from './outbox/outbox.service'
import { PreflightService } from './preflight/preflight.service'
import { AuthController } from './auth/auth.controller'
import { AuthService, X_AUTH_CONFIG, XAuthConfig } from './auth/auth.service'
import { dataSourceOptions } from './data-source'
import { HealthController } from './health.controller'
import { CampaignsController } from './discovery/campaigns.controller'
import { DiscoveryService } from './discovery/discovery.service'
import { ProspectsService } from './discovery/prospects.service'
import { FitService } from './fit/fit.service'
import { InboxController } from './inbox/inbox.controller'
import { InboxService } from './inbox/inbox.service'
import { RepliesService } from './inbox/replies.service'
import { JobsService } from './jobs/jobs.service'
import { DECISION_CLIENT } from './decisions/review-decisions'
import { EvidenceRecheckService } from './fit/evidence-recheck.service'
import { AI_ENV_VARS, createDecisionClient, createLlmClient } from './llm/ai-config'
import { LlmUsageService } from './llm/llm-usage.service'
import type { LlmUsageSink } from './llm/llm-client'
import { LLM_CLIENT, LlmClient } from './llm/llm-client'
import { RetentionService } from './retention/retention.service'
import { CampaignDraftsController } from './review/campaign-drafts.controller'
import { DraftService } from './review/draft.service'
import { ProspectDraftController } from './review/prospect-draft.controller'
import { ReviewActionsController } from './review/review-actions.controller'
import { ReviewActionsService } from './review/review-actions.service'
import { ReviewController } from './review/review.controller'
import { ReviewSummaryController } from './review/review-summary.controller'
import { ReviewSummaryService } from './review/review-summary.service'
import { ReviewService } from './review/review.service'
import { SenderProfileController } from './review/sender-profile.controller'
import { SendingService } from './sending/sending.service'
import { SendSettingsController } from './sending/send-settings.controller'
import { SendSettingsService } from './sending/send-settings.service'
import { Worker } from './sending/worker'
import { FakeXClient } from './x/fake-x-client'
import { LiveXClient } from './x/live-x-client'
import { lazyChatReader } from './x/chat-wiring'
import { X_CLIENT, XClient } from './x/x-client'

const aiEnv = (config: ConfigService) => Object.fromEntries(AI_ENV_VARS.map((k) => [k, config.get<string>(k, '')]))

// Token counts go to llm_usage without ever failing the model call.
const meter = (usage: LlmUsageService): LlmUsageSink => (u) => void usage.record(u).catch((err: unknown) => console.error('llm usage not saved', err))

function liveClient(config: ConfigService, auth: AuthService): XClient {
  const keysFile = config.get('XCHAT_KEYS_FILE', '')
  if (!keysFile) return new LiveXClient(() => auth.session())
  const self: { client?: LiveXClient } = {}
  const chat = lazyChatReader(keysFile, config.get('TOKEN_KEY', ''), (path) => self.client!.getJson(path))
  self.client = new LiveXClient(() => auth.session(), fetch, chat)
  return self.client
}

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env', '../../.env'] }),
    TypeOrmModule.forRoot({ ...dataSourceOptions, migrations: [] }),
  ],
  controllers: [
    HealthController,
    ReviewActionsController,
    SenderProfileController,
    CampaignDraftsController,
    ProspectDraftController,
    ReviewController,
    AuthController,
    CampaignsController,
    InboxController,
    PreflightController,
    HealthDetailsController,
    TopBarController,
    AttentionController,
    DoNotContactController,
    KnownListController,
    OutboxController,
    InboundLaneController,
    FunnelController,
    ActivityController,
    SendSettingsController,
    ReviewSummaryController,
  ],
  providers: [
    JobsService,
    DiscoveryService,
    ProspectsService,
    SendingService,
    Worker,
    AuthService,
    {
      provide: X_AUTH_CONFIG,
      inject: [ConfigService],
      useFactory: (config: ConfigService): XAuthConfig => ({
        clientId: config.get('X_CLIENT_ID', ''),
        clientSecret: config.get('X_CLIENT_SECRET', ''),
        redirectUri: config.get('X_REDIRECT_URI', 'http://localhost:3000/api/auth/x/callback'),
        tokenKey: config.get('TOKEN_KEY', ''),
      }),
    },
    FitService,
    DraftService,
    ReviewService,
    ReviewActionsService,
    RetentionService,
    InboxService,
    RepliesService,
    AttentionService,
    DoNotContactService,
    KnownListService,
    HandleExtractor,
    OutboxService,
    InboundLaneService,
    FunnelService,
    ActivityService,
    SendSettingsService,
    LlmUsageService,
    EvidenceRecheckService,
    ReviewSummaryService,
    {
      provide: PreflightService,
      inject: [DataSource, AuthService, ConfigService],
      useFactory: (ds: DataSource, auth: AuthService, config: ConfigService) => new PreflightService(ds, auth, config),
    },
    {
      provide: LLM_CLIENT,
      inject: [ConfigService, LlmUsageService],
      useFactory: (config: ConfigService, usage: LlmUsageService): LlmClient => createLlmClient(aiEnv(config), meter(usage)),
    },
    {
      provide: DECISION_CLIENT,
      inject: [ConfigService, LLM_CLIENT, LlmUsageService],
      useFactory: (config: ConfigService, llm: LlmClient, usage: LlmUsageService) => createDecisionClient(aiEnv(config), llm, meter(usage)),
    },
    {
      provide: X_CLIENT,
      inject: [ConfigService, AuthService],
      useFactory: (config: ConfigService, auth: AuthService): XClient =>
        config.get('X_MODE', 'fake') === 'live' ? liveClient(config, auth) : FakeXClient.fromFixtures(),
    },
  ],
})
export class AppModule {}
