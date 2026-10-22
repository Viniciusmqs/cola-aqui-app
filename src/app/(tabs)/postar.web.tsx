import { Empty, Screen } from '@/components/ui';

/** Registros são gravados só pela câmera do app no celular (regra do produto). */
export default function PostarWeb() {
  return (
    <Screen style={{ justifyContent: 'center' }}>
      <Empty
        title="Poste pelo celular"
        text="Os registros são gravados na hora, pela câmera do app no celular. Assim ninguém posta vídeo velho."
      />
    </Screen>
  );
}
