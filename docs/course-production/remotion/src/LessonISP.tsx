import React from 'react';
import {
  AbsoluteFill,
  Audio,
  Freeze,
  Img,
  Loop,
  OffthreadVideo,
  Sequence,
  interpolate,
  staticFile,
  useCurrentFrame,
} from 'remotion';
import {Sticker} from './Sticker';
import manifest from '../public/lessonISP/manifest.json';

const BLUE = '#62b3f3';

type Label = {text: string; delay: number};
type Beat = {
  id: string;
  tag: string;
  mode: 'hero' | 'animation' | 'static';
  still?: string;
  video?: string;
  videoFrames?: number;
  durationInFrames: number;
  voFrames: number;
  labels: Label[];
  transition: 'cut' | 'slide';
  badge?: boolean;
  loop?: boolean;
  holdLastFrame?: boolean;
  safeArtBaked?: boolean;
};

const Badge: React.FC = () => (
  <Img src={staticFile('lessonA/bmh-endcard.png')} style={{position:'absolute',right:36,bottom:30,width:130,opacity:.96}} />
);

const Visual: React.FC<{beat:Beat}> = ({beat}) => {
  const frame=useCurrentFrame();
  const slideX=beat.transition==='slide'?interpolate(frame,[0,12],[1600,0],{extrapolateLeft:'clamp',extrapolateRight:'clamp'}):0;
  const open=beat.id==='b01'?interpolate(frame,[0,14],[0,1],{extrapolateLeft:'clamp',extrapolateRight:'clamp'}):1;
  const close=beat.id==='b22'?interpolate(frame,[beat.durationInFrames-18,beat.durationInFrames-1],[1,0],{extrapolateLeft:'clamp',extrapolateRight:'clamp'}):1;
  const stillScale=beat.safeArtBaked ? 1 : (beat.mode==='static'?interpolate(frame,[0,beat.durationInFrames],[1,1.035],{extrapolateLeft:'clamp',extrapolateRight:'clamp'}):1);
  const stillStyle: React.CSSProperties = beat.safeArtBaked ? {width:1600,height:900} : {
    width:1600,
    height:900,
    transform:`scale(${stillScale})`,
    transformOrigin:'center',
  };
  const vf=Math.max(1,beat.videoFrames??1);
  const play=Math.min(vf,beat.durationInFrames);
  return (
    <AbsoluteFill style={{backgroundColor:BLUE,overflow:'hidden',transform:`translateX(${slideX}px)`,opacity:open*close}}>
      {beat.mode==='static' && beat.still ? <Img src={staticFile(beat.still)} style={stillStyle} /> : null}
      {beat.mode==='animation' && beat.video && beat.loop ? (
        <Loop durationInFrames={vf}><OffthreadVideo muted src={staticFile(beat.video)} style={{width:1600,height:900}} /></Loop>
      ) : null}
      {beat.mode==='animation' && beat.video && beat.holdLastFrame ? (
        <>
          <Sequence from={0} durationInFrames={play}><OffthreadVideo muted src={staticFile(beat.video)} style={{width:1600,height:900}} /></Sequence>
          {beat.durationInFrames>vf ? <Sequence from={vf} durationInFrames={beat.durationInFrames-vf}>
            <Freeze frame={vf-1}><OffthreadVideo muted src={staticFile(beat.video)} style={{width:1600,height:900}} /></Freeze>
          </Sequence> : null}
        </>
      ) : null}
      {beat.mode==='hero' && beat.video ? (
        <>
          <Sequence from={0} durationInFrames={play}><OffthreadVideo muted src={staticFile(beat.video)} style={{width:1600,height:900}} /></Sequence>
          {beat.durationInFrames>vf ? <Sequence from={vf} durationInFrames={beat.durationInFrames-vf}>
            <Freeze frame={vf-1}><OffthreadVideo muted src={staticFile(beat.video)} style={{width:1600,height:900}} /></Freeze>
          </Sequence> : null}
        </>
      ) : null}
      {beat.labels.map((label,i)=><Sticker key={`${beat.id}-${i}`} text={label.text} role="label" bg="white" delay={label.delay} until={beat.labels[i+1] ? beat.labels[i+1].delay-2 : beat.voFrames+8} bottomCenter />)}
      {beat.badge?<Badge/>:null}
    </AbsoluteFill>
  );
};

export const LessonISP: React.FC = () => {
  let cursor=0;
  return (
    <AbsoluteFill style={{backgroundColor:BLUE}}>
      <Audio src={staticFile(manifest.audio)} />
      {(manifest.beats as Beat[]).map((beat)=>{
        const from=cursor; cursor+=beat.durationInFrames;
        return <Sequence key={beat.id} from={from} durationInFrames={beat.durationInFrames}><Visual beat={beat}/></Sequence>;
      })}
    </AbsoluteFill>
  );
};

export const LESSON_ISP_FRAMES = manifest.totalFrames;
