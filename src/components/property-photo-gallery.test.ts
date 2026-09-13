import { expect, it } from 'vitest';
import { propertyPhotoCaption } from './property-photo-gallery';
it.each(['Close-up', 'Wide-angle', 'CC-BY-SA'])('preserves authored hyphenated caption %s', (caption)=>{
 expect(propertyPhotoCaption(caption, 'Crossing')).toBe(caption);
});
it('uses the actual property title instead of an internal filename caption',()=>{
 expect(propertyPhotoCaption('shibuya-scramble-crossing-5_large','渋谷スクランブル交差点','/api/r2/NbJ-IS95yS-shibuya-scramble-crossing-5_large.jpg')).toBe('渋谷スクランブル交差点');
 expect(propertyPhotoCaption('cover_003.webp','Warehouse','https://example.test/cover_003.webp?signature=x')).toBe('Warehouse');
 expect(propertyPhotoCaption('','Warehouse')).toBe('Warehouse');
});
it('requires matching image source evidence rather than guessing from punctuation or numbers',()=>{
 expect(propertyPhotoCaption('shibuya-scramble-crossing-5_large','Crossing','/other.jpg')).toBe('shibuya-scramble-crossing-5_large');
 expect(propertyPhotoCaption('CC-BY-SA','Crossing','/photo.jpg')).toBe('CC-BY-SA');
 expect(propertyPhotoCaption('Photo-2026','Crossing','/photo.jpg')).toBe('Photo-2026');
 expect(propertyPhotoCaption('cover_003.webp','Warehouse','/other.jpg')).toBe('cover_003.webp');
 expect(propertyPhotoCaption('cover_003','Warehouse','/api/r2/Ab_123-cover_003.webp?x=1')).toBe('Warehouse');
 expect(propertyPhotoCaption('夕景','Crossing','/photo.jpg')).toBe('夕景');
 expect(propertyPhotoCaption('Close-up','Crossing','/%invalid.jpg')).toBe('Close-up');
});
it('retains authored descriptions and photographer attribution',()=>{
 expect(propertyPhotoCaption('Kakidai · CC BY-SA 4.0','Crossing')).toBe('Kakidai · CC BY-SA 4.0');
 expect(propertyPhotoCaption('Benh Lieu Song · CC BY-SA 2.0','Crossing')).toBe('Benh Lieu Song · CC BY-SA 2.0');
 expect(propertyPhotoCaption('交差点の夕景','Crossing')).toBe('交差点の夕景');
 expect(propertyPhotoCaption('  Crossing  ','Crossing')).toBe('Crossing');
});
