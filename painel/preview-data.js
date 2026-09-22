export const MAX_PEOPLE = 2000;

const firstNames = ['Ana', 'Beatriz', 'Carlos', 'Daniela', 'Eduardo', 'Fernanda', 'Gabriel', 'Helena', 'Isabela', 'João', 'Luísa', 'Marcos', 'Natália', 'Otávio', 'Paula', 'Rafael', 'Sofia', 'Tiago', 'Valéria', 'William'];
const middleNames = ['Almeida', 'Barbosa', 'Campos', 'Dias', 'Esteves', 'Ferreira', 'Gomes', 'Lima', 'Martins', 'Nogueira'];
const lastNames = ['Andrade', 'Borges', 'Carvalho', 'Duarte', 'Freitas', 'Guimarães', 'Medeiros', 'Oliveira', 'Pereira', 'Silva'];

export function clampCount(value, max = MAX_PEOPLE) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(0, Math.trunc(number))) : 0;
}

export function makePreviewPeople(count) {
  return Array.from({length: count}, (_, index) => ({
    name: `${firstNames[index % firstNames.length]} ${middleNames[Math.floor(index / firstNames.length) % middleNames.length]} ${lastNames[Math.floor(index / (firstNames.length * middleNames.length)) % lastNames.length]}`,
    deviceId: `preview-${index + 1}`
  }));
}
