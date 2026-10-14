import { ShaderAnimation } from "@/components/ui/shader-animation"

export default function ShaderAnimationDemo() {
  return (
    <div className="relative flex h-screen w-full flex-col items-center justify-center overflow-hidden bg-black">
      <ShaderAnimation />
      <div className="absolute pointer-events-none z-10 text-center">
        <h1 className="text-7xl font-bold font-semibold leading-none tracking-tighter whitespace-pre-wrap text-white">
          Shader Animation
        </h1>
        <p className="mt-4 text-xl text-gray-300">
          Interactive Three.js Shader Effect
        </p>
      </div>
    </div>
  )
}
