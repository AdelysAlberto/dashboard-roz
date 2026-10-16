import { Play, Volume2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Button } from '../../../components/ui/Button';
import { Select } from '../../../components/ui/Select';
import { Textarea } from '../../../components/ui/Textarea';
import { api } from '../../../services/api';
import { ServiceInfo } from '../../../types/service';
import { useToastStore } from '../../../stores/useToastStore';
import { useKokoroVoices } from '../hooks/useEngine';

const LANG_LABEL: Record<string, string> = {
  'en-US': 'Inglés (US)',
  'en-GB': 'Inglés (UK)',
  'es-ES': 'Español',
  'fr-FR': 'Francés',
  'hi-IN': 'Hindi',
  'it-IT': 'Italiano',
  'ja-JP': 'Japonés',
  'pt-BR': 'Portugués (BR)',
  'zh-CN': 'Chino (Mandarín)',
};

interface VoicesTabProps {
  service: ServiceInfo;
}

export function VoicesTab({ service }: VoicesTabProps) {
  const voices = useKokoroVoices(service.id);
  const toast = useToastStore();
  const [text, setText] = useState('Hola, soy Alfred. Tienes una reunión a las diez.');
  const [voice, setVoice] = useState('');
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const defaultVoice = voices.data?.default ?? '';
  const selected = voice || defaultVoice;

  // Si cambia el default del servicio y el usuario no eligió nada, el select lo sigue.
  useEffect(() => {
    if (!voice && defaultVoice) setVoice(defaultVoice);
  }, [defaultVoice, voice]);

  // Revocar el blob anterior al desmontar o al generar uno nuevo.
  useEffect(() => {
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [audioUrl]);

  const options = useMemo(() => {
    const items = voices.data?.voices ?? [];
    return items.map((v) => ({
      value: v.id,
      label: `${v.id} · ${LANG_LABEL[v.lang] ?? v.lang}${v.id === defaultVoice ? ' (default)' : ''}`,
    }));
  }, [voices.data, defaultVoice]);

  const synthesize = useMutation({
    mutationFn: () =>
      api.kokoroSynthesize(service.id, { text: text.trim(), voice: selected, speed: 1.0 }),
    onSuccess: (data) => {
      const bytes = Uint8Array.from(atob(data.audio_base64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: `audio/${data.format === 'mp3' ? 'mpeg' : data.format}` });
      const url = URL.createObjectURL(blob);
      setAudioUrl((old) => {
        if (old) URL.revokeObjectURL(old);
        return url;
      });
      // Reproducir al generar (se monta el <audio> en el mismo ciclo).
      setTimeout(() => {
        audioRef.current?.play().catch(() => undefined);
      }, 0);
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : 'síntesis fallida', `${service.name} · Voz`),
  });

  const setDefault = useMutation({
    mutationFn: () => api.kokoroSetDefaultVoice(service.id, selected),
    onSuccess: (data) => {
      toast.success(`Voz por defecto: ${data.default_voice}`, service.name);
      setVoice(data.default_voice);
      void voices.refetch();
    },
    onError: (error) =>
      toast.error(
        error instanceof Error ? error.message : 'no se pudo fijar la voz',
        `${service.name} · Voz`,
      ),
  });

  return (
    <div className="engine-tab-body">
      <div className="engine-section">
        <h5>Probar voces</h5>
        <p className="engine-muted">
          Escribí un texto, elegí una voz y escuchá el resultado. Cuando encuentres la que te
          guste, fijala como por defecto: todos los proyectos que omiten <code>voice</code> (Alfred,
          n8n, viasera) la usarán.
        </p>

        <Textarea
          label="Texto de prueba"
          value={text}
          rows={3}
          maxLength={2000}
          onChange={(e) => setText(e.target.value)}
        />

        <div className="kokoro-voice-row">
          <Select
            label="Voz"
            value={selected}
            options={options}
            onChange={(e) => setVoice(e.target.value)}
            disabled={voices.isLoading}
          />
          <div className="kokoro-voice-actions">
            <Button
              variant="secondary"
              size="sm"
              disabled={!text.trim() || !selected}
              isLoading={synthesize.isPending}
              leftIcon={<Play size={12} />}
              onClick={() => synthesize.mutate()}
            >
              Escuchar
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={!selected || selected === defaultVoice}
              isLoading={setDefault.isPending}
              leftIcon={<Volume2 size={12} />}
              onClick={() => setDefault.mutate()}
              title="Fija la voz por defecto del servicio (persiste en su .env)"
            >
              Usar como default
            </Button>
          </div>
        </div>

        {voices.isError && (
          <p className="engine-error">Kokoro no respondió. ¿Está corriendo en :8033?</p>
        )}
        {voices.data && !voices.data.model_loaded && (
          <p className="engine-muted">Modelo descargado: la primera prueba tarda ~1s.</p>
        )}

        {audioUrl && (
          <audio ref={audioRef} controls src={audioUrl} className="kokoro-audio" />
        )}
      </div>
    </div>
  );
}
