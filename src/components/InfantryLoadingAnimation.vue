<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue'

// Props 定义
interface Props {
  // 是否显示载入动画
  show?: boolean
  // 单次动画时长（秒）
  duration?: number
  // 动画播放次数（0 表示无限循环）
  iterations?: number
  // 是否自动关闭（播放完成后自动触发 close 事件）
  autoClose?: boolean
  // 背景颜色
  backgroundColor?: string
  // 车辆和场景的主题色
  themeColor?: string
}

const props = withDefaults(defineProps<Props>(), {
  show: true,
  duration: 2,
  iterations: 2,
  autoClose: true,
  backgroundColor: '#f5f5f5',
  themeColor: '#2c3e50'
})

// Emit 定义
const emit = defineEmits<{
  close: []
}>()

// 车轮旋转角度
const wheelRotation = ref(0)

// 车轮半径（像素）
const WHEEL_RADIUS = 8

// 车辆DOM元素引用
const vehicleRef = ref<HTMLElement | null>(null)

// 上一次记录的车辆位置
let lastVehicleLeft: number | null = null

// 动画帧ID
let animationFrameId: number | null = null

// 载入定时器ID
let loadingTimeoutId: number | null = null

// 更新车轮旋转角度
function updateWheelRotation() {
  if (!vehicleRef.value) {
    animationFrameId = requestAnimationFrame(updateWheelRotation)
    return
  }
  
  // 获取车辆元素的实际位置
  const rect = vehicleRef.value.getBoundingClientRect()
  const currentLeft = rect.left
  
  // 初始化上一次位置
  if (lastVehicleLeft === null) {
    lastVehicleLeft = currentLeft
    animationFrameId = requestAnimationFrame(updateWheelRotation)
    return
  }
  
  // 计算位移
  const displacement = currentLeft - lastVehicleLeft
  
  // 检测动画循环重置（车辆突然跳回起点）
  if (Math.abs(displacement) > 100) {
    // 动画重新开始，重置车轮旋转和位置记录
    wheelRotation.value = 0
    lastVehicleLeft = currentLeft
  } else {
    // 正常情况：根据物理公式计算旋转角度
    // θ(弧度) = s / r，转为度数 = θ × 180 / π
    const rotationIncrement = (displacement / WHEEL_RADIUS) * (180 / Math.PI)
    wheelRotation.value += rotationIncrement
    
    // 更新上一次的位置
    lastVehicleLeft = currentLeft
  }
  
  // 继续下一帧
  animationFrameId = requestAnimationFrame(updateWheelRotation)
}

// 启动动画
function startAnimation() {
  // 重置状态
  wheelRotation.value = 0
  lastVehicleLeft = null
  
  // 等待DOM渲染完成后获取车辆元素
  nextTick(() => {
    // 确保元素存在
    if (vehicleRef.value) {
      updateWheelRotation()
    }
  })
  
  // 设置自动关闭定时器
  if (props.autoClose && props.iterations > 0) {
    const totalDuration = props.duration * props.iterations * 1000
    loadingTimeoutId = window.setTimeout(() => {
      emit('close')
    }, totalDuration)
  }
}

// 停止动画
function stopAnimation() {
  if (animationFrameId !== null) {
    cancelAnimationFrame(animationFrameId)
    animationFrameId = null
  }
  
  if (loadingTimeoutId !== null) {
    clearTimeout(loadingTimeoutId)
    loadingTimeoutId = null
  }
}

// 监听 show 属性变化
watch(() => props.show, (newVal) => {
  if (newVal) {
    startAnimation()
  } else {
    stopAnimation()
  }
}, { immediate: true })

onMounted(() => {
  if (props.show) {
    startAnimation()
  }
})

onUnmounted(() => {
  stopAnimation()
})

// 计算动画参数
const animationDuration = `${props.duration}s`
const animationIterations = props.iterations === 0 ? 'infinite' : props.iterations
</script>

<template>
  <Transition name="fade">
    <div v-if="show" class="loading-screen" :style="{ background: backgroundColor }">
      <div class="scene">
        <!-- 斜坡 -->
        <div class="ramp" :style="{ background: themeColor }"></div>
        <!-- 落地平台 -->
        <div class="landing-platform" :style="{ background: themeColor }"></div>
        
        <!-- 步兵车 -->
        <div 
          ref="vehicleRef"
          class="infantry-vehicle"
        >
          <!-- 车体轮廓 -->
          <div class="vehicle-body">
            <!-- 主车身 -->
            <div class="chassis-line" :style="{ borderColor: themeColor }"></div>
            <!-- 云台 -->
            <div class="turret-line" :style="{ borderColor: themeColor }"></div>
            <!-- 炮管 -->
            <div class="barrel-line" :style="{ background: themeColor }"></div>
          </div>
          
          <!-- 两个车轮 (侧视图) - 实时计算旋转 -->
          <div 
            class="wheel front-wheel" 
            :style="{ 
              transform: `rotate(${wheelRotation}deg)`,
              borderColor: themeColor 
            }"
          >
            <span class="spoke" :style="{ background: themeColor }"></span>
            <span class="spoke vertical" :style="{ background: themeColor }"></span>
          </div>
          <div 
            class="wheel rear-wheel" 
            :style="{ 
              transform: `rotate(${wheelRotation}deg)`,
              borderColor: themeColor 
            }"
          >
            <span class="spoke" :style="{ background: themeColor }"></span>
            <span class="spoke vertical" :style="{ background: themeColor }"></span>
          </div>
        </div>
        
        <!-- 载入文字 -->
        <div class="loading-text" :style="{ color: themeColor }">
          <span>载入中</span>
          <span class="dots"></span>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
/* 淡入淡出过渡效果 */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.5s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.loading-screen {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 9999;
  overflow: hidden;
}

.scene {
  position: relative;
  width: 600px;
  height: 400px;
}

/* 斜坡 - 简约线条 */
.ramp {
  position: absolute;
  bottom: 67px;
  left: 50px;
  width: 160px;
  height: 3px;
  transform: rotate(-30deg);
  transform-origin: left bottom;
}

/* 落地平台 - 与坡面起点同高 */
.landing-platform {
  position: absolute;
  bottom: 56px;
  right: 40px;
  width: 180px;
  height: 3px;
}

/* 步兵车 - 简约线条风格 */
.infantry-vehicle {
  position: absolute;
  width: 70px;
  height: 45px;
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.1));
  transform-origin: 35px 37px;
  animation: vehicle-motion v-bind(animationDuration) linear v-bind(animationIterations) forwards;
}

/* 真实物理运动：上坡快速匀速 -> 抛物线 -> 摩擦减速 */
@keyframes vehicle-motion {
  0% {
    bottom: 79px;
    left: 30px;
    transform: rotate(-30deg);
  }
  
  4% {
    bottom: 93px;
    left: 54px;
    transform: rotate(-30deg);
  }
  
  8% {
    bottom: 107px;
    left: 78px;
    transform: rotate(-30deg);
  }
  
  12% {
    bottom: 121px;
    left: 102px;
    transform: rotate(-30deg);
  }
  
  16% {
    bottom: 135px;
    left: 126px;
    transform: rotate(-30deg);
  }
  
  20% {
    bottom: 149px;
    left: 150px;
    transform: rotate(-30deg);
  }
  
  22% {
    bottom: 157px;
    left: 166px;
    transform: rotate(-22deg);
  }
  
  25% {
    bottom: 173px;
    left: 195px;
    transform: rotate(-8deg);
  }
  
  28% {
    bottom: 187px;
    left: 225px;
    transform: rotate(2deg);
  }
  
  31% {
    bottom: 195px;
    left: 255px;
    transform: rotate(8deg);
  }
  
  34% {
    bottom: 193px;
    left: 285px;
    transform: rotate(15deg);
  }
  
  37% {
    bottom: 183px;
    left: 315px;
    transform: rotate(22deg);
  }
  
  40% {
    bottom: 165px;
    left: 345px;
    transform: rotate(30deg);
  }
  
  43% {
    bottom: 140px;
    left: 375px;
    transform: rotate(36deg);
  }
  
  46% {
    bottom: 110px;
    left: 405px;
    transform: rotate(40deg);
  }
  
  49% {
    bottom: 80px;
    left: 430px;
    transform: rotate(42deg);
  }
  
  51% {
    bottom: 58px;
    left: 445px;
    transform: rotate(0deg);
  }
  
  54% {
    bottom: 58px;
    left: 462px;
    transform: rotate(0deg);
  }
  
  58% {
    bottom: 58px;
    left: 475px;
    transform: rotate(0deg);
  }
  
  63% {
    bottom: 58px;
    left: 484px;
    transform: rotate(0deg);
  }
  
  69% {
    bottom: 58px;
    left: 490px;
    transform: rotate(0deg);
  }
  
  75%, 100% {
    bottom: 58px;
    left: 493px;
    transform: rotate(0deg);
  }
}

/* 车体主体 */
.vehicle-body {
  position: relative;
  width: 100%;
  height: 100%;
}

/* 底盘线条 */
.chassis-line {
  position: absolute;
  bottom: 12px;
  left: 5px;
  width: 60px;
  height: 18px;
  border: 2.5px solid;
  border-radius: 2px;
  background: transparent;
}

/* 前斜装甲 */
.chassis-line::before {
  content: '';
  position: absolute;
  top: 15px;
  left: -5px;
  width: 20px;
  height: 2.5px;
  background: currentColor;
  transform: rotate(-80deg);
  transform-origin: left center;
}

/* 后部 */
.chassis-line::after {
  content: '';
  position: absolute;
  top: 15px;
  right: -5px;
  width: 20px;
  height: 2.5px;
  background: currentColor;
  transform: rotate(80deg);
  transform-origin: right center;
}

/* 云台线条 */
.turret-line {
  position: absolute;
  bottom: 28px;
  left: 28px;
  width: 22px;
  height: 14px;
  border: 2.5px solid;
  border-radius: 2px 2px 1px 1px;
  background: transparent;
}

/* 云台底座圆形 */
.turret-line::before {
  content: '';
  position: absolute;
  bottom: -8px;
  left: 50%;
  transform: translateX(-50%);
  width: 18px;
  height: 8px;
  border: 2.5px solid;
  border-radius: 50%;
  border-top: none;
  background: transparent;
}

/* 炮管 */
.barrel-line {
  position: absolute;
  bottom: 38px;
  left: 52px;
  width: 28px;
  height: 2.5px;
  border-radius: 1px;
}

/* 车轮 - 仅两个 (侧视图) */
.wheel {
  position: absolute;
  bottom: 0;
  width: 16px;
  height: 16px;
  border: 2.5px solid;
  border-radius: 50%;
  background: transparent;
}

/* 车轮辐条效果 */
.spoke {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 100%;
  height: 2px;
  transform: translate(-50%, -50%);
}

.spoke.vertical {
  transform: translate(-50%, -50%) rotate(90deg);
}

/* 前轮 */
.front-wheel {
  left: 48px;
}

/* 后轮 */
.rear-wheel {
  left: 8px;
}

/* 载入文字 */
.loading-text {
  position: absolute;
  bottom: 30px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 18px;
  font-weight: 500;
  letter-spacing: 2px;
  display: flex;
  align-items: center;
  gap: 4px;
}

.dots::after {
  content: '';
  animation: dots 1.5s steps(4, end) infinite;
}

@keyframes dots {
  0%, 20% { content: ''; }
  40% { content: '.'; }
  60% { content: '..'; }
  80%, 100% { content: '...'; }
}
</style>
