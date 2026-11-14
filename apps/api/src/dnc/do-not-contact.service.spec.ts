import 'reflect-metadata'
import { BadRequestException, NotFoundException } from '@nestjs/common'
import { DataSource } from 'typeorm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { ActivityLog } from '../activity/activity-log.entity'
import { DoNotContact, XUser } from '../sending/entities'
import { createTestDataSource } from '../test/db'
import { DoNotContactService } from './do-not-contact.service'

let ds: DataSource
let service: DoNotContactService

beforeEach(async () => {
  ds = await createTestDataSource()
  service = new DoNotContactService(ds)
  await ds.getRepository(XUser).save({ xUserId: '201', handle: 'mina_builds' })
  await ds.getRepository(DoNotContact).save([
    { xUserId: '201', reason: 'Reply marked Opt-out', source: 'operator' },
    { xUserId: '202', reason: 'Imported list', source: 'csv' },
  ])
})

afterAll(async () => {
  if (ds?.isInitialized) await ds.destroy()
})

describe('DoNotContactService', () => {
  it('lists the people with their handle, reason and source, newest first', async () => {
    const list = await service.list()
    expect(list.map((p) => [p.xUserId, p.handle, p.reason, p.source])).toEqual([
      ['202', '202', 'Imported list', 'csv'],
      ['201', 'mina_builds', 'Reply marked Opt-out', 'operator'],
    ])
  })

  it('removing needs a reason and leaves the person on the list', async () => {
    await expect(service.remove('201', '  ')).rejects.toBeInstanceOf(BadRequestException)
    await expect(service.remove('201', 'ok')).rejects.toBeInstanceOf(BadRequestException)
    expect(await ds.getRepository(DoNotContact).count()).toBe(2)
    expect(await ds.getRepository(ActivityLog).count()).toBe(0)
  })

  it('removes the person and writes the reason to the activity log', async () => {
    await service.remove('201', ' They asked to hear from us again ')
    expect(await ds.getRepository(DoNotContact).findOneBy({ xUserId: '201' })).toBeNull()
    expect(await ds.getRepository(DoNotContact).findOneBy({ xUserId: '202' })).not.toBeNull()
    const [entry] = await ds.getRepository(ActivityLog).find()
    expect(entry).toMatchObject({ kind: 'dnc_removed', subject: '201', detail: 'They asked to hear from us again' })
  })

  it('a person who is not on the list is a 404 and nothing is logged', async () => {
    await expect(service.remove('999', 'Mistake, wrong person')).rejects.toBeInstanceOf(NotFoundException)
    expect(await ds.getRepository(ActivityLog).count()).toBe(0)
  })
})
