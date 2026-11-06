/**
 * Türkçe büyük/küçük harf ve aksan farkını yok say:
 * "MİGROS" = "MIGROS" = "Migros", "ÖZLEM" = "OZLEM", "ÇAYIROVA" = "cayirova".
 * Banka ekstreleri aynı işyerini bazen Türkçe harfle, bazen ASCII yazar.
 */
export function foldTr(s: string): string {
  return s
    .toLocaleLowerCase("tr")
    .replace(/ı/g, "i")
    .replace(/ş/g, "s")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}
