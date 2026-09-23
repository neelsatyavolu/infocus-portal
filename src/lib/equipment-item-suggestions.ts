export type EquipmentItemSuggestion = { id: string; name: string; barcode: string };

export function matchingEquipmentItems(items: EquipmentItemSuggestion[], query: string, addedCodes: string[]) {
  const search = query.trim().toLowerCase();
  if (!search) return [];
  return items.filter((item) => !addedCodes.includes(item.barcode) && (
    item.barcode.toLowerCase().includes(search) || item.name.toLowerCase().includes(search)
  ));
}
