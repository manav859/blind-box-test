import type {
  BlindBoxCatalog,
  BlindBoxPoolItem,
} from "../types/blindBox";
import type { useBlindBoxAdminApi } from "../hooks/useBlindBoxAdminApi";

type BlindBoxAdminApi = ReturnType<typeof useBlindBoxAdminApi>;

export async function loadBlindBoxCatalog(
  api: BlindBoxAdminApi
): Promise<BlindBoxCatalog> {
  const blindBoxes = await api.listBlindBoxes();
  const poolItemGroups = await Promise.all(
    blindBoxes.map(async (blindBox) => ({
      blindBoxId: blindBox.id,
      items: await api.listPoolItems(blindBox.id),
    }))
  );

  const poolItems = poolItemGroups.flatMap((group) => group.items);
  const poolItemsById = poolItems.reduce<Record<string, BlindBoxPoolItem>>(
    (accumulator, item) => {
      accumulator[item.id] = item;
      return accumulator;
    },
    {}
  );

  return {
    blindBoxes,
    poolItems,
    poolItemsById,
  };
}
