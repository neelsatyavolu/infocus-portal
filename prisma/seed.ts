import { prisma } from "@/src/lib/prisma";

async function main() {
  console.log("No default seed configured.");
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
