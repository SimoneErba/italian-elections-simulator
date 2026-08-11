import { z } from "zod";

const chamberSchema = z.union([z.literal("camera"), z.literal("senate")]);
const bigintFromUnknown = z.union([z.bigint(), z.number().int(), z.string().regex(/^-?\d+$/)]).transform((value) => BigInt(value));
const foreignPartitionIdSchema = z.union([
  z.literal("EUROPA"),
  z.literal("AMERICA_MERIDIONALE"),
  z.literal("AMERICA_SETTENTRIONALE_CENTRALE"),
  z.literal("AFRICA_ASIA_OCEANIA_ANTARTIDE")
]);
const foreignChamberSchema = z.object({
  total_seats: z.number().int().nonnegative(),
  partitions: z.array(
    z.object({
      id: foreignPartitionIdSchema,
      name: z.string().min(1),
      seats: z.number().int().nonnegative(),
      resident_citizens: z.number().int().nonnegative(),
      lists: z.array(
        z.object({
          id: z.string().min(1),
          name: z.string().min(1),
          votes: z.number().int().nonnegative(),
          candidates: z.array(
            z.object({
              id: z.string().min(1).optional(),
              name: z.string().min(1),
              preferences: z.number().int().nonnegative().nullable().optional(),
              list_position: z.number().int().positive()
            })
          )
        })
      )
    })
  )
});
export const foreignElectionDataSchema = z.object({
  election: z.literal("politiche-2022"),
  date: z.literal("2022-09-25"),
  chambers: z.object({
    camera: foreignChamberSchema,
    senato: foreignChamberSchema
  })
});

export const electionInputSchema = z.object({
  schemaVersion: z.literal("1.0"),
  lawVersion: z.literal("ac-2822-a-2026-07-16"),
  electionDate: z.string().date().optional(),
  lists: z.array(
    z.object({
      id: z.string().min(1),
      name: z.string().min(1),
      coalitionId: z.string().min(1).optional(),
      isLinguisticMinority: z.boolean().optional(),
      protectedRegionId: z.string().min(1).optional()
    })
  ),
  coalitions: z.array(
    z.object({
      id: z.string().min(1),
      name: z.string().min(1),
      alias: z.string().min(1).optional(),
      listIds: z.array(z.string().min(1))
    })
  ),
  regions: z.array(z.object({ id: z.string().min(1), name: z.string().min(1) })),
  constituencies: z.array(
    z.object({
      id: z.string().min(1),
      chamber: chamberSchema,
      regionId: z.string().min(1),
      name: z.string().min(1)
    })
  ),
  multiMemberDistricts: z.array(
    z.object({
      id: z.string().min(1),
      chamber: chamberSchema,
      constituencyId: z.string().min(1),
      regionId: z.string().min(1),
      name: z.string().min(1),
      seatsWithBonus: z.number().int().nonnegative(),
      seatsWithoutBonus: z.number().int().nonnegative(),
      specialTerritory: z.literal("trentino-alto-adige").optional()
    })
  ),
  singleMemberDistricts: z
    .array(
      z.object({
        id: z.string().min(1),
        chamber: chamberSchema,
        regionId: z.string().min(1),
        constituencyId: z.string().min(1).optional(),
        name: z.string().min(1),
        specialTerritory: z.union([z.literal("valle-aosta"), z.literal("trentino-alto-adige")]),
        seats: z.literal(1)
      })
    )
    .optional(),
  listVotes: z.array(
    z.object({
      chamber: chamberSchema,
      districtId: z.string().min(1),
      listId: z.string().min(1),
      votes: bigintFromUnknown
    })
  ),
  candidateVotes: z
    .array(
      z.object({
        chamber: chamberSchema,
        districtId: z.string().min(1),
        candidateId: z.string().min(1),
        votes: bigintFromUnknown
      })
    )
    .optional(),
  candidates: z
    .array(
      z.object({
        id: z.string().min(1),
        firstName: z.string(),
        lastName: z.string(),
        age: z.number().int().positive().optional(),
        birthYear: z.number().int().min(1800).optional(),
        party: z.string().optional()
      })
    )
    .optional(),
  nominations: z
    .array(
      z.object({
        candidateId: z.string().min(1),
        chamber: chamberSchema,
        listId: z.string().min(1),
        connectedSubjectId: z.string().min(1).optional(),
        districtId: z.string().min(1).optional(),
        constituencyId: z.string().min(1).optional(),
        position: z.number().int().positive(),
        nominationType: z.union([
          z.literal("multi-member"),
          z.literal("bonus-constituency-list"),
          z.literal("single-member"),
          z.literal("foreign")
        ])
      })
    )
    .optional(),
  bonusCandidateLists: z
    .array(
      z.object({
        candidateId: z.string().min(1),
        chamber: chamberSchema,
        connectedSubjectId: z.string().min(1),
        position: z.number().int().positive()
      })
    )
    .optional(),
  foreignElection: foreignElectionDataSchema
});
