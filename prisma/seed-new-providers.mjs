import dotenv from "dotenv";
dotenv.config();

// Fix psycopg2-style URL for Prisma
if (process.env.DATABASE_URL) {
  process.env.DATABASE_URL = process.env.DATABASE_URL
    .replace("postgresql+psycopg2://", "postgresql://")
    .replace("&channel_binding=require", "");
}

import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const newProviders = [
  // Cardiology
  { name: "Dr. Ayesha Khan",       service: "Cardiology",    fee_pkr: 3000 },
  { name: "Dr. Bilal Ahmed",       service: "Cardiology",    fee_pkr: 3500 },
  { name: "Dr. Fatima Noor",       service: "Cardiology",    fee_pkr: 2800 },
  // Dermatology
  { name: "Dr. Usman Tariq",       service: "Dermatology",   fee_pkr: 2500 },
  { name: "Dr. Sana Malik",        service: "Dermatology",   fee_pkr: 2200 },
  { name: "Dr. Hira Javed",        service: "Dermatology",   fee_pkr: 2000 },
  // Orthopedics
  { name: "Dr. Kamran Raza",       service: "Orthopedics",   fee_pkr: 4000 },
  { name: "Dr. Nadia Shah",        service: "Orthopedics",   fee_pkr: 3800 },
  { name: "Dr. Imran Siddiqui",    service: "Orthopedics",   fee_pkr: 3500 },
  // Pediatrics
  { name: "Dr. Zara Hassan",       service: "Pediatrics",    fee_pkr: 1800 },
  { name: "Dr. Ali Raza",          service: "Pediatrics",    fee_pkr: 2000 },
  { name: "Dr. Maryam Qureshi",    service: "Pediatrics",    fee_pkr: 1500 },
  // Neurology
  { name: "Dr. Shahid Mehmood",    service: "Neurology",     fee_pkr: 5000 },
  { name: "Dr. Rabia Aslam",       service: "Neurology",     fee_pkr: 4500 },
  // ENT
  { name: "Dr. Waqas Butt",        service: "ENT",           fee_pkr: 2000 },
  { name: "Dr. Amna Riaz",         service: "ENT",           fee_pkr: 1800 },
  // Gynecology
  { name: "Dr. Saima Iqbal",       service: "Gynecology",    fee_pkr: 3000 },
  { name: "Dr. Lubna Farooq",      service: "Gynecology",    fee_pkr: 3200 },
  // Ophthalmology
  { name: "Dr. Asad Ali",          service: "Ophthalmology", fee_pkr: 2500 },
  { name: "Dr. Kiran Batool",      service: "Ophthalmology", fee_pkr: 2300 },
];

// Generate slots for the next 7 days, 4 slots per day
function generateSlots(providerId) {
  const slots = [];
  const times = [
    { h: 9,  m: 0  },
    { h: 11, m: 0  },
    { h: 14, m: 0  },
    { h: 16, m: 0  },
  ];

  for (let dayOffset = 1; dayOffset <= 7; dayOffset++) {
    const d = new Date();
    d.setDate(d.getDate() + dayOffset);
    const dateStr = d.toISOString().slice(0, 10); // YYYY-MM-DD

    for (const t of times) {
      slots.push({
        provider_id: providerId,
        date:     new Date(`${dateStr}T00:00:00.000Z`),
        time:     new Date(`1970-01-01T${String(t.h).padStart(2,"0")}:${String(t.m).padStart(2,"0")}:00.000Z`),
        end_time: new Date(`1970-01-01T${String(t.h + 1).padStart(2,"0")}:${String(t.m).padStart(2,"0")}:00.000Z`),
        is_booked: false,
      });
    }
  }
  return slots;
}

async function main() {
  console.log("🏥 Seeding new providers and available slots...\n");

  for (const p of newProviders) {
    // Check if provider already exists (by name + service)
    const existing = await prisma.provider.findFirst({
      where: { name: p.name, service: p.service },
    });
    if (existing) {
      console.log(`⏭️  Skipping ${p.name} (${p.service}) — already exists`);
      continue;
    }

    const provider = await prisma.provider.create({
      data: {
        name: p.name,
        service: p.service,
        fee_pkr: p.fee_pkr,
        is_active: true,
        created_by: "seed-script",
      },
    });

    const slots = generateSlots(provider.id);
    await prisma.slot.createMany({ data: slots, skipDuplicates: true });

    console.log(`✅  ${provider.name} (${provider.service}) — ${slots.length} available slots created`);
  }

  // Summary
  const totalProviders = await prisma.provider.count();
  const totalSlots     = await prisma.slot.count({ where: { is_booked: false } });
  console.log(`\n📊 Total providers: ${totalProviders}`);
  console.log(`📊 Total available (unbooked) slots: ${totalSlots}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
