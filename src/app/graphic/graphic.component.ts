import { AfterViewInit, Component, ElementRef, Input, OnInit, ViewChild } from '@angular/core';
import gsap, { Power1 } from 'gsap';
import { BoxGeometry, CameraHelper, Clock, Color, CylinderGeometry, DataTexture, DirectionalLight, DirectionalLightHelper, DoubleSide, Font, FontLoader, FrontSide, Group, HemisphereLight, HemisphereLightHelper, IcosahedronBufferGeometry, Intersection, IUniform, Light, LightShadow, Material, Mesh, MeshBasicMaterial, MeshLambertMaterial, MeshPhongMaterial, MeshStandardMaterial, Object3D, PerspectiveCamera, PlaneGeometry, PointLight, PointLightHelper, Raycaster, Scene, Shader, ShaderMaterial, SphereGeometry, SpotLight, SpotLightHelper, TextGeometry, Vector3, WebGL1Renderer, WebGLRenderer } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { GLTF, GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { WeatherService } from '../weather.service';
import { DistrictGraphData, DistrictMeshData, MapInfoInFirebase } from '../interfaces';
import { AngularFireDatabase, AngularFireList } from '@angular/fire/database';
import { ActivatedRoute, ParamMap } from '@angular/router';
import { environment } from 'src/environments/environment';

@Component({
  selector: 'app-graphic',
  templateUrl: './graphic.component.html',
  styleUrls: ['./graphic.component.scss']
})
export class GraphicComponent implements OnInit, AfterViewInit {

  @ViewChild('canvas') canvas!: ElementRef<HTMLElement>
  scene: Scene
  camera: PerspectiveCamera
  renderer: WebGLRenderer
  light: PointLight
  directionalLight: DirectionalLight
  pointLight: PointLight
  hemisphereLight: HemisphereLight
  spotlight: SpotLight
  raycaster: Raycaster
  mouse: { x: number, y: number }
  taiwanMap: Object3D
  mouseHoverAnyMesh: boolean
  orbitcontrols: OrbitControls
  textsMeshAndColor: { textMesh: Mesh, districtMesh: Mesh, textHexColor: string }[]
  meshDataOnHtml: DistrictMeshData | undefined
  htmlTextColor: string = '#666666'
  mouseHoverDetalessMesh: boolean = false
  meshesData: DistrictMeshData[]
  box: Object3D
  box2: Object3D
  mapGltf?: GLTF
  showPopup: boolean = false;
  toneColor: { maxHex: string, minHex: string } = { maxHex: 'EEF588', minHex: '70a7f3' }
  units: { tone: string, height: string } = { tone: '溫', height: '降雨量' }
  dimensionRequirement: { height: boolean, tone: boolean } = { height: true, tone: true }
  toneExtremum: { max: number, min: number } = { max: 0, min: 0 }
  dbList: AngularFireList<any>
  sumHeight: number;
  measureRenderTime: number = 0

  constructor(
    private weatherService: WeatherService,
    private db: AngularFireDatabase,
    private route: ActivatedRoute,
  ) {
    this.dbList = this.db.list('maps')
    this.scene = new Scene()
    this.camera = new PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    this.renderer = new WebGLRenderer({ precision: "lowp", antialias: true })
    this.directionalLight = new DirectionalLight()
    this.pointLight = new PointLight()
    this.hemisphereLight = new HemisphereLight()
    this.spotlight = new SpotLight()
    this.raycaster = new Raycaster()
    this.mouse = { x: 0, y: 0 }
    this.taiwanMap = new Object3D()
    this.textsMeshAndColor = []
    this.mouseHoverAnyMesh = false
    this.orbitcontrols = new OrbitControls(this.camera, this.renderer.domElement)
    this.meshesData = []

    this.box = new Mesh()
    this.box2 = new Mesh()
    this.light = new PointLight()
    this.sumHeight = 0
  }

  ngOnInit(): void {
  }

  blurCanvas = () => {
    this.showPopup = !this.showPopup
    this.animate()
  }

  async ngAfterViewInit() {
    this.setupRenderer()
    this.setupCamera()
    this.setupScene()
    this.setupLight()
    await this.setupCloud()
    // this.setupBoxForTest()
    this.setUpTaiwan3dModel().then((Taiwan3dModel: GLTF) => {
      this.mapGltf = Taiwan3dModel
      const mapId = this.route.snapshot.paramMap.get('id') || undefined
      Taiwan3dModel.scene.scale.set(0.1, 0.1, 0.1)
      this.setupMap(mapId)
    })

    this.dbList.snapshotChanges(['child_added']).subscribe(actions => {
      actions.forEach(action => {
        // console.log(action.type);
        // console.log(action.key);
        // console.log(action.payload.val());
      });
    });
    setTimeout(() => {
      let expectedFrameRate = this.renderer.info.render.frame / 30
      let useHighPerformance = expectedFrameRate > 10
      let useLowPerformance = expectedFrameRate < 4
      console.log(expectedFrameRate, useHighPerformance);
      if (useHighPerformance) {
        const hqLight = new DirectionalLight()
        this.setupShadowTexture(hqLight, 1024)
        hqLight.intensity = 0.35
        hqLight.color = new Color(0xffffff)
        hqLight.position.set(-7, 7, -5)
        hqLight.castShadow = true
        this.directionalLight.removeFromParent()
        this.scene.add(hqLight)
      }
      if (useLowPerformance) {
        // this.renderer = new WebGLRenderer({ antialias: true, precision: "highp" })
        const hqLight = new DirectionalLight()
        hqLight.castShadow = false
        hqLight.intensity = 0.35
        hqLight.color = new Color(0xffffff)
        hqLight.position.set(-7, 7, -5)
        this.directionalLight.removeFromParent()
        this.scene.add(hqLight)
      }
    }, 6000);
  }

  setupCloud = async () => {
    const next = await this.weatherService.getCloudImage().toPromise()
    const int8Array = new Uint8ClampedArray(next)
    const base64String = btoa(String.fromCharCode(...int8Array))
    const img = new Image()
    const canvas = document.createElement("canvas")
    canvas.width = 572
    canvas.height = 572
    const context = canvas.getContext('2d')
    img.onload = () => {
      if (!context) throw new Error("No constext found");
      context.drawImage(img, 0, 0)
      let imageData = context?.getImageData(0, 0, 572, 572)
      this.filterDarkness(imageData, 100)
      this.normalize(imageData, {top: 255, bottom: 100})
      let alphaImageArray = Uint8ClampedArray.from(imageData.data)
      let heightImageArray = Uint8ClampedArray.from(imageData.data)
      heightImageArray = this.shrinkImageData(imageData, 1).data
      const alphaTexture = new DataTexture(alphaImageArray, imageData.width, imageData.height)
      const heightTexture = new DataTexture(heightImageArray, imageData.width, imageData.height)
      const cloudMaterial = new MeshStandardMaterial({
        color: 0xffffff,
        transparent: true,
        // map: alphaTexture,
        alphaMap: alphaTexture,
        displacementMap: heightTexture,
        displacementScale: -0.1,
        side: DoubleSide,
      })
      cloudMaterial.depthWrite = false
      const cloudGeo = new PlaneGeometry(17.4, 17.4, 572, 572)
      cloudGeo.rotateY(Math.PI)
      cloudGeo.rotateZ(Math.PI*0.993)
      cloudGeo.rotateX(-Math.PI * 0.5)
      cloudGeo.translate(3.7, 0, 0.4)
      const cloudObj = new Mesh(cloudGeo, cloudMaterial)
      cloudObj.translateY(2)
      cloudObj.name = 'cloud'
      this.scene.add(cloudObj)
    }
    img.src = 'data:image/jpeg;base64,' + base64String
  }

  normalize = (imageData: ImageData, from: {top: number, bottom: number}): ImageData => {
    for (let i = 0; i < imageData.data.length; i++) {
      const oldBandwith = 255 - from.bottom
      const enlargeRate = 255 / oldBandwith
      const newPixel = (imageData.data[i] - from.bottom) * enlargeRate
      const intNewPixel = Math.floor(newPixel)
      imageData.data[i] = intNewPixel
    }
    return imageData
  }

  shrinkImageData = (imageData: ImageData, shrinkPixels: number) => {
    const pixelsToShrink: number[] = []

    const _forEachPixel = (row: number, column: number) => {
      const pixelId = row * imageData.width + column
      const isCurren0 = imageData.data[pixelId * 4] <= 0
      const isUpper0 = imageData.data[(pixelId - imageData.width) * 4] <= 0
      const isBottom0 = imageData.data[(pixelId + imageData.width) * 4] <= 0
      const isLeft0 = imageData.data[(pixelId - 1) * 4] <= 0
      const isRight0 = imageData.data[(pixelId + 1) * 4] <= 0
      if (!isCurren0) {
        if (isBottom0 || isRight0 || isLeft0 || isUpper0) {
          pixelsToShrink.push(pixelId * 4 + 0, pixelId * 4 + 1, pixelId * 4 + 2)
        }
      }
    }

    const _lookUpPixels = (imageData: ImageData) => {
      for (let row = 0; row < imageData.height; row++) {
        for (let column = 0; column < imageData.width; column++) {
          _forEachPixel(row, column)
        }
      }
    }

    for (let shrinkCount = 0; shrinkCount < shrinkPixels; shrinkCount++) {
      _lookUpPixels(imageData)
      pixelsToShrink.forEach(pixel => imageData.data[pixel] = 0)
    }

    return imageData
  }

  filterDarkness = (imageData: ImageData, threshold: number): ImageData => {
    for (let pixel = 0; pixel < imageData.data.length; pixel += 4) {
      const isDarkness = imageData.data[pixel] < threshold ? true : false
      if (isDarkness) {
        imageData.data[pixel] = 0
        imageData.data[pixel + 1] = 0
        imageData.data[pixel + 2] = 0
      }
    }
    return imageData
  }

  transparentMesh = (mesh: Mesh, opacity: number = 0.6) => {
    if (mesh.isMesh) {
      const currentMaterial: Material = (<Material>mesh.material)
      // @ts-ignore
      currentMaterial.color = { r: 1, g: 1, b: 1 };
      currentMaterial.opacity = opacity
    }
  }

  paintMeshFrom = (array: DistrictMeshData[], meshToPaint: Mesh, paintNotFoundMesh: { r: number, g: number, b: number } = { r: 1, g: 1, b: 1 }) => {
    const meshData = this.findDataByMeshName(array, meshToPaint)
    if (meshData && meshData.rgbColor) {
      // @ts-ignore
      meshToPaint.material.color = meshData && meshData.rgbColor ? meshData.rgbColor : paintNotFoundMesh
    }
  }

  transparentMeshes = (scene: Object3D, opacity: number = 0.6) => {
    scene.traverse(object3d => this.transparentMesh(<Mesh>object3d, opacity))
  }

  paintMapTextFrom = (hoverMesh: Mesh) => {
    const textAboveMesh = this.textsMeshAndColor.filter(text => text.textMesh.name.includes(hoverMesh.name))
    if (textAboveMesh.length !== 0) {
      // @ts-ignore 
      textAboveMesh.forEach(foundText => foundText.textMesh.material.color = this.convertHexTo0to1(foundText.textHexColor))
    } else {
      // no text above the hovered mesh
    }
  }

  paintColorOnMapText = () => {
    this.textsMeshAndColor.forEach(({ textMesh, textHexColor: textColor }) => {
      // @ts-ignore
      textMesh.material.color = this.convertHexTo0to1(textColor)
    });
  }

  onMousemove = (event: MouseEvent) => {
    event.preventDefault()
    this.mouse = this.updateMousePosiion(event)
    this.raycaster.setFromCamera(this.mouse, this.camera)
    const mapMeshes = this.taiwanMap.children[0]

    if (mapMeshes) {
      const intersactions = this.raycaster.intersectObjects(mapMeshes.children, true)
      if (intersactions.length > 0) {
        this.mouseHoverAnyMesh = true
        this.onMouseHoveringLand(mapMeshes, intersactions)
      } else if (this.mouseHoverAnyMesh) {
        this.mouseHoverAnyMesh = false
        this.onMouseLeavingLand(mapMeshes)
      }
    } else {
      // scene not setup yet or had gone
    }
  }

  onMouseHoveringLand = (mapMeshes: Object3D, intersactions: Intersection[]) => {
    this.transparentMeshes(mapMeshes)
    this.hideClouds(mapMeshes)
    this.textsMeshAndColor.forEach(textMesh => this.transparentMesh(textMesh.textMesh))
    const nearestToCamera: Intersection = intersactions.sort((a, b) => a.distance - b.distance)[0]
    const meshOnHover = <Mesh>nearestToCamera.object
    this.paintMeshFrom(this.meshesData, meshOnHover);
    // @ts-ignore
    meshOnHover.material.opacity = 1;
    const districtColor = this.findDataByMeshName(this.meshesData, meshOnHover)?.rgbColor;
    if (districtColor) {
      this.htmlTextColor = '#' + this.convert0to1ToHex(districtColor);
      this.mouseHoverDetalessMesh = false
    } else { this.mouseHoverDetalessMesh = true }
    this.paintMapTextFrom(meshOnHover)
    this.updateTextOnHtml(intersactions)
  }

  onMouseLeavingLand = (mapMeshes: Object3D) => {
    mapMeshes.traverse(object3d => {
      if ((<Mesh>object3d).isMesh) {
        this.paintMeshFrom(this.meshesData, <Mesh>object3d);
        // @ts-ignore
        (<Mesh>object3d).material.opacity = 1
      }
    })
    this.paintColorOnMapText()
  }

  updateTextOnHtml = (intersactions: Intersection[]) => {
    const nearestCamera: Intersection = intersactions.sort((a, b) => a.distance - b.distance)[0]
    this.meshDataOnHtml = this.findDataByMeshName(this.meshesData, <Mesh>nearestCamera.object)
  }

  updateMousePosiion = (event: MouseEvent): { x: number, y: number } => {
    const mouseXFromDivLeft = event.offsetX
    const mouseYFromDivTop = event.offsetY
    const mouseXInCanvas0to1 = mouseXFromDivLeft / this.canvas.nativeElement.offsetWidth
    const mouseYInCanvas0to1 = mouseYFromDivTop / this.canvas.nativeElement.offsetHeight
    const mouseXInCanvasMinor1to1 = (mouseXInCanvas0to1 * 2) - 1
    const mouseYInCanvasMinor1to1 = -(mouseYInCanvas0to1 * 2) + 1
    return { x: mouseXInCanvasMinor1to1, y: mouseYInCanvasMinor1to1 }
  }

  setupRenderer = () => {
    this.renderer.shadowMap.enabled = true;
    this.renderer.setSize(this.canvas.nativeElement.offsetWidth, this.canvas.nativeElement.offsetHeight);
    this.canvas.nativeElement.appendChild(this.renderer.domElement);
    this.animate()
  }

  setupCamera = () => {
    this.camera.aspect = this.canvas.nativeElement.offsetWidth / this.canvas.nativeElement.offsetHeight
    // this.camera.position.set(5, 16, 1);
    this.camera.position.set(0, 16, 0);
    // this.camera.lookAt(4, 0, 0);
    this.camera.lookAt(0, 0, 0);
    // this.animateCamera()
  }

  animateCamera = () => {
    const from = { px: 5, py: 16, pz: 1, lx: 4, ly: 0, lz: 0 }
    const to = { px: 3, py: 9, pz: 8, lx: 2, ly: -3, lz: 0 }
    gsap.to(from, {
      ...to,
      duration: 1.5,
      ease: Power1.easeInOut,
      onUpdate: (() => {
        this.camera.position.set(from.px, from.py, from.pz);
        this.camera.lookAt(from.lx, from.ly, from.lz)
      })
    }).delay(1.5).play()
  }

  setupBoxForTest = () => {
    const boxGeo = new BoxGeometry(2, 2, 2);
    const boxMaterial = new MeshLambertMaterial({ color: 0xffffff, opacity: 0.8, transparent: true })
    this.box = new Mesh(boxGeo, boxMaterial)
    this.box.traverse(object3d => {
      if ((<Mesh>object3d).isMesh) {
        //@ts-ignore
        (<Mesh>object3d).castShadow = true;
        (<Mesh>object3d).receiveShadow = true;
      }
    })
    this.box2 = new Mesh(boxGeo, boxMaterial)
    this.box2.traverse(object3d => {
      if ((<Mesh>object3d).isMesh) {
        //@ts-ignore
        (<Mesh>object3d).receiveShadow = true;
      }
    })
    this.box2.position.set(1, -2, 1)
    this.scene.add(this.box2)
    this.scene.add(this.box)
  }

  setupScene = () => {
    this.scene.background = new Color(0xeeeeee)
  }

  setupShadowTexture = (light: DirectionalLight, textureSize: number) => {
    light.shadow.camera.near = 8;
    light.shadow.camera.far = 18;
    light.shadow.camera.left = -8;
    light.shadow.camera.right = 6;
    light.shadow.camera.top = 6;
    light.shadow.camera.bottom = 0;
    light.shadow.mapSize.width = textureSize
    light.shadow.mapSize.height = textureSize
  }

  setupLight = () => {
    this.hemisphereLight.intensity = 0.8
    this.hemisphereLight.color = new Color(0xffffff)
    this.scene.add(this.hemisphereLight)

    this.setupShadowTexture(this.directionalLight, 512)

    this.directionalLight.intensity = 0.35
    this.directionalLight.color = new Color(0xffffff)
    this.directionalLight.position.set(-7, 7, -5)
    this.directionalLight.castShadow = true
    this.scene.add(this.directionalLight)
    // this.scene.add(new CameraHelper(this.directionalLight.shadow.camera));

    this.pointLight.intensity = 0.1
    this.pointLight.color = new Color(0xffffff)
    this.pointLight.position.set(5, 6, -2)
    this.scene.add(this.pointLight)
    // this.scene.add(new PointLightHelper(this.pointLight));
  }

  createMeshesData = (graphsData: DistrictGraphData[]): DistrictMeshData[] => {
    return graphsData.map(graph => {
      const meshdata = new DistrictMeshData()
      meshdata.tone = graph.tone
      meshdata.height = graph.height
      meshdata.zhCityName = graph.cityName
      meshdata.zhDistrictName = graph.districtName
      return meshdata
    })
  }

  assignMeshesdEnName = (meshesData: DistrictMeshData[]): DistrictMeshData[] => {
    return meshesData.map(meshData => {
      const mapMeshGraph = this.weatherService.districtsEnZhMap.find(map => {
        return map.zhCity === meshData.zhCityName && map.zhDistrict === meshData.zhDistrictName
      })
      if (mapMeshGraph) {
        meshData.enCityName = mapMeshGraph.enCity
        meshData.enDistrictName = mapMeshGraph.enDistrict
        return meshData
      } else {
        console.error(meshData);
        alert(`匯入表單資料時，找不到這個鄉鎮市區在3D模型上對應的物件：${meshData.zhCityName}${meshData.zhDistrictName}`)
        throw new Error("A Mesh Has No English Name");
      }
    })
  }

  blendHexColors = (c0: string, c1: string, p: number) => {
    var f = parseInt(c0.slice(1), 16), t = parseInt(c1.slice(1), 16), R1 = f >> 16, G1 = f >> 8 & 0x00FF, B1 = f & 0x0000FF, R2 = t >> 16, G2 = t >> 8 & 0x00FF, B2 = t & 0x0000FF;
    return "" + (0x1000000 + (Math.round((R2 - R1) * p) + R1) * 0x10000 + (Math.round((G2 - G1) * p) + G1) * 0x100 + (Math.round((B2 - B1) * p) + B1)).toString(16).slice(1);
  }

  getToneRange = (WeatherInDistricts: DistrictMeshData[]) => {
    const sortByTemp = WeatherInDistricts.sort((a, b) => +a.tone - +b.tone)
    const maxTone = +sortByTemp[sortByTemp.length - 1].tone
    const minTone = +sortByTemp[0].tone
    return [maxTone, minTone]
  }

  getHeightRange = (meshData: DistrictMeshData[]) => {
    const sortByTemp = meshData.sort((a, b) => +a.height - +b.height)
    const maxHeight = +sortByTemp[sortByTemp.length - 1].height
    const minHeight = +sortByTemp[0].height
    return [maxHeight, minHeight]
  }

  findDataByMeshName = (meshesData: DistrictMeshData[], mesh: Mesh): DistrictMeshData | undefined => {
    return meshesData.find(meshData => `${meshData.enDistrictName}_${meshData.enCityName}` === mesh.name)
  }

  getMaterialColorByRate = (highestTemp: number, lowestTemp: number, currentTemp: number): { r: number, g: number, b: number, } => {
    const colorRate = (currentTemp - highestTemp) / (lowestTemp - highestTemp)
    const hashColor = this.blendHexColors('#' + this.toneColor.maxHex, '#' + this.toneColor.minHex, colorRate)
    return this.convertHexTo0to1(hashColor)
  }

  animateDistrictsHeight = () => {
    const [maxHeight, minHeight] = this.getHeightRange(this.meshesData)
    for (let i = 0; i < this.meshesData.length; i++) {
      const height = this.meshesData[i].height || 0
      const from = { scaleY: 1 }
      const normalizedScale = (+height - minHeight) / (maxHeight - minHeight);
      const to = { scaleY: normalizedScale * 20 + 1 }
      const districtMeshAnimation =
        gsap.to(
          from, {
          ...to,
          duration: 1,
          onStart: (() => {
            if (height !== 0) {
              this.meshesData[i].mesh3d.castShadow = true
            }
          }),
          onUpdate: (() => {
            this.meshesData[i].mesh3d.scale.setY(from.scaleY)
            this.meshesData[i].mesh3d.position.setY(from.scaleY / 2)
          }),
          ease: Power1.easeInOut
        }
        ).delay(1).play()
    }
  }

  setUpTaiwan3dModel = () => {
    const loader = new GLTFLoader()
    return loader.loadAsync(this.weatherService.addBaseUrl('/assets/taiwam15.gltf'))

  }

  setupMap = (mapId?: string) => {
    console.log(mapId);

    if (mapId && mapId !== 'weather') {
      // google sheet 資料
      this.weatherService.getMapDataFromFirebase(mapId).subscribe(mapData => {
        this.setupTone(mapData)
        this.setupDimensionText(mapData)
        const googleSheetId = this.weatherService.getGoogleSheetIdFromUrl(mapData.sourceUrl)
        this.weatherService.getGoogleSheetInfo(googleSheetId).subscribe(graphData => {
          this.generateMap(graphData)
        })
      })
    } else {
      // weather 資料
      this.weatherService.getWeatherInfo().subscribe(graphData => {
        // gltf.scene.position.set(0, 0, this.move)
        this.generateMap(graphData)
      });
    }
  }

  setupDimensionText = (mapInfo: MapInfoInFirebase) => {
    this.dimensionRequirement.height = mapInfo.requireHeightDimension === "true" ? true : false
    this.dimensionRequirement.tone = mapInfo.requireToneDimension === "true" ? true : false
  }

  setupTone = (mapInfo: MapInfoInFirebase) => {
    this.toneColor.maxHex = mapInfo.MaxToneHex
    this.toneColor.minHex = mapInfo.MinToneHex
    this.units.height = mapInfo.HeightDimensionUnit
    this.units.tone = mapInfo.ToneDimensionUnit
  }

  generateMap = (graphData: DistrictGraphData[]) => {
    console.log(graphData);
    const gltf: GLTF = <GLTF>this.mapGltf
    if (this.taiwanMap) this.taiwanMap.removeFromParent()
    // gltf.scene.position.set(0, 0, this.move)
    // this.move++
    this.setupMeshData(graphData)
    this.toneExtremum = this.getToneExtremum(this.meshesData)
    this.sumHeight = this.getSumHeight(this.meshesData)
    this.setupMapMesh(gltf.scene)
    this.setupAndAnimateTexts()
    this.animateDistrictsHeight()
    this.scene.add(gltf.scene)

  }

  setupMeshData = (graphData: DistrictGraphData[]) => {
    this.meshesData = this.createMeshesData(graphData)
    this.meshesData = this.assignMeshesdEnName(this.meshesData)
  }

  setupMapMesh = (scene: Group) => {
    const mapMaterial = new MeshPhongMaterial({ opacity: 1.0, transparent: true })
    const [maxTone, minTone] = this.getToneRange(this.meshesData)
    this.taiwanMap = scene;

    scene.traverse(object3d => {
      const mesh: Mesh = (<Mesh>object3d)
      if (mesh.isMesh) {
        mesh.material = mapMaterial.clone();
        mesh.receiveShadow = true
        const meshData = this.findDataByMeshName(this.meshesData, mesh)
        if (meshData) {
          // 這邊因為有複數的資料，如果有兩個重複的鄉鎮市區資料，那麼地圖會抓到第一個，然後染色。第二個鄉鎮市區資料則不會染色。當mousemove抓到之後染色時就抓不到資料
          meshData.rgbColor = this.getMaterialColorByRate(maxTone, minTone, meshData.tone);
          // @ts-ignore
          mesh.material.color = meshData.rgbColor
          meshData.mesh3d = mesh
        } else {
          // @ts-ignore
          mesh.material.color = { r: 1, g: 1, b: 1 }
        }
      }
    });
  }

  getArrayIndexBy = (extremumType: string, array: any[]): number => {
    let position
    if (extremumType === 'max') {
      position = 0
    } else if (extremumType === 'min') {
      position = array.length - 1
    }
    return position || 0
  }

  findMeshFromIndex = (array: DistrictMeshData[], index: number): Mesh => {
    let retrunMesh: Mesh = new Mesh()
    this.taiwanMap.traverse(mesh => {
      if ((<Mesh>mesh).name === `${array[index].enDistrictName}+${array[index].enCityName}`) {
        retrunMesh = (<Mesh>mesh)
      }
    })
    if (retrunMesh) {
      return retrunMesh
    } else {
      throw new Error("can't traverse to get mesh info");
    }
  }

  getToneExtremum = (meshesData: DistrictMeshData[]): { max: number, min: number } => {
    const sortedMesh = meshesData.sort((a, b) => +b.tone - +a.tone)
    return { max: sortedMesh[0].tone, min: sortedMesh[sortedMesh.length - 1].tone }
  }

  getSumHeight = (meshesData: DistrictMeshData[]): number => {
    let sum = 0
    meshesData.forEach(mesh => sum += mesh.height)
    return sum
  }

  getExtremumMesh = (extremumType: string, dimension: string, meshesData: DistrictMeshData[]): DistrictMeshData => {
    let extremumToneMesh: Mesh | undefined
    let returnMeshData: DistrictMeshData | undefined
    if (dimension === 'tone') {
      const dataSortByDimension = meshesData.sort((a, b) => +b.tone - +a.tone)
      const extremumIndex = this.getArrayIndexBy(extremumType, dataSortByDimension)
      extremumToneMesh = this.findMeshFromIndex(dataSortByDimension, extremumIndex)
      returnMeshData = dataSortByDimension[extremumIndex]
    } else if (dimension === 'height') {
      const dataSortByDimension = meshesData.sort((a, b) => +b.height - +a.height)
      const extremumIndex = this.getArrayIndexBy(extremumType, dataSortByDimension)
      extremumToneMesh = this.findMeshFromIndex(dataSortByDimension, extremumIndex)
      returnMeshData = dataSortByDimension[extremumIndex]
    }
    if (returnMeshData) {
      return returnMeshData
    } else {
      throw new Error(`cannot get the ${dimension} mesh`);
    }
  }

  setupAndAnimateTexts = () => {
    const maxToneMesh = this.getExtremumMesh('max', 'tone', this.meshesData);
    const minToneMesh = this.getExtremumMesh('min', 'tone', this.meshesData);
    const maxHeightMesh = this.getExtremumMesh('max', 'height', this.meshesData);
    const minHeightMesh = this.getExtremumMesh('min', 'height', this.meshesData);



    const loader = new FontLoader()
    loader.load(this.weatherService.addBaseUrl('/assets/jf-openhuninn-1.1_Regular_districts_words.json'), ((font) => {
      if (this.textsMeshAndColor.length !== 0) {
        this.textsMeshAndColor.forEach(textMesh => textMesh.textMesh.removeFromParent())
        this.textsMeshAndColor = []
      }

      let maxHeightMeshGroup: Group
      // let minHeightMeshGroup: Group
      if (this.dimensionRequirement.height) {
        const maxHeightTitleMesh = this.createTextMesh(font, maxHeightMesh.mesh3d, maxHeightMesh.zhDistrictName, maxHeightMesh.rgbColor)
        // const minHeightTitleMesh = this.createTextMesh(font, minHeightMesh.mesh3d, minHeightMesh.zhDistrictName, minHeightMesh.rgbColor)
        const maxHeightSubtitleMesh = this.createTextMesh(font, maxHeightMesh.mesh3d, `最高 ${Math.round(+maxHeightMesh.height * 10) / 10}`, maxHeightMesh.rgbColor)
        // const minHeightSubtitleMesh = this.createTextMesh(font, minHeightMesh.mesh3d, `最高降雨量 ${Math.round(+minHeightMesh.height * 10) / 10}mm`, minHeightMesh.rgbColor)
        maxHeightMeshGroup = this.createTextMeshGroup(maxHeightTitleMesh, maxHeightSubtitleMesh)
        // minHeightMeshGroup = this.createTextMeshGroup(minHeightTitleMesh, minHeightSubtitleMesh)
        this.animateText(maxHeightMeshGroup, maxHeightMesh)
        // this.animateText(minHeightMeshGroup, minHeightMesh)

      }

      let maxToneMeshGroup: Group
      let minToneMeshGroup: Group
      if (this.dimensionRequirement.tone) {
        const maxToneTitleMesh = this.createTextMesh(font, maxToneMesh.mesh3d, maxToneMesh.zhDistrictName, maxToneMesh.rgbColor)
        const minToneTitleMesh = this.createTextMesh(font, minToneMesh.mesh3d, minToneMesh.zhDistrictName, minToneMesh.rgbColor)
        const maxToneSubtitleMesh = this.createTextMesh(font, maxToneMesh.mesh3d, `最高 ${Math.round(+maxToneMesh.tone * 10) / 10}`, maxToneMesh.rgbColor)
        const minToneSubtitleMesh = this.createTextMesh(font, minToneMesh.mesh3d, `最低 ${Math.round(+minToneMesh.tone * 10) / 10}`, minToneMesh.rgbColor)
        maxToneMeshGroup = this.createTextMeshGroup(maxToneTitleMesh, maxToneSubtitleMesh)
        minToneMeshGroup = this.createTextMeshGroup(minToneTitleMesh, minToneSubtitleMesh)
        this.animateText(maxToneMeshGroup, maxToneMesh)
        this.animateText(minToneMeshGroup, minToneMesh)
      }




      this.orbitcontrols.addEventListener('change', () => {
        if (maxToneMeshGroup) { maxToneMeshGroup.children.forEach(child => child.lookAt(this.camera.position)) }
        if (minToneMeshGroup) { minToneMeshGroup.children.forEach(child => child.lookAt(this.camera.position)) }
        if (maxHeightMeshGroup) { maxHeightMeshGroup.children.forEach(child => child.lookAt(this.camera.position)) }
      })
    }))
  }

  faceCamera = (objects: Object3D[]) => {
    objects.forEach(object => object.lookAt(this.camera.position))
  }

  animateText = (fontMesh: Mesh | Group, meshData: DistrictMeshData) => {
    const [highestRainning, lowestRainning] = this.getHeightRange(this.meshesData)
    const normalizedScale = (+meshData.height - lowestRainning) / (highestRainning - lowestRainning);
    const from = { scaleY: 1 }
    const to = { scaleY: normalizedScale * 20 + 1 }
    gsap.to(from, {
      ...to,
      duration: 1.5,
      onUpdate: (() => {
        fontMesh.position.setY((from.scaleY / 9))
      }),
      ease: Power1.easeInOut
    }).delay(1).play()
  }

  createTextMeshGroup = (title: Mesh, subtitle: Mesh): Group => {
    const group = new Group()
    subtitle.scale.set(0.6, 0.6, 0.6)
    subtitle.translateY(1.7)
    subtitle.name = subtitle.name + ' subtitle'
    title.translateY(1)
    title.name = title.name + ' subtitle'
    group.add(title).add(subtitle)
    this.scene.add(group)
    return group
  }

  createTextMesh = (font: Font, districtMesh: Mesh, text: string, districtColor: { r: number, g: number, b: number }, options: { size: number, height: number } = { size: 0.3, height: 0 }): Mesh => {
    let fontMesh
    const geometry = new TextGeometry(text, {
      font: font,
      height: options.height,
      size: options.size,
      curveSegments: 1,
      bevelEnabled: false
    })

    const fontColor: string = this.blendHexColors('#' + this.convert0to1ToHex(districtColor), '#000000', 0.3)
    const material = new MeshPhongMaterial({ color: +('0x' + fontColor) })
    fontMesh = new Mesh(geometry, material)
    fontMesh.position.set(districtMesh.position.x * 0.1, districtMesh.position.y * 0.1, districtMesh.position.z * 0.1)
    fontMesh.name = `${districtMesh.name} text`

    this.textsMeshAndColor.push({ textMesh: fontMesh, districtMesh: districtMesh, textHexColor: fontColor + '' })
    this.scene.add(fontMesh)
    return fontMesh
  }

  convert0to1ToHex = (color: { r: number, g: number, b: number } = { r: 0.4, g: 0.4, b: 0.4 }): string => {
    const rHex: string = Math.floor((color.r * 256)).toString(16)
    const gHex: string = Math.floor(color.g * 256).toString(16)
    const bHex: string = Math.floor(color.b * 256).toString(16)
    return rHex + gHex + bHex
  }

  convertHexTo0to1 = (hex: string) => {
    return {
      r: parseInt(hex.slice(0, 2), 16) / 255,
      g: parseInt(hex.slice(2, 4), 16) / 255,
      b: parseInt(hex.slice(4, 6), 16) / 255
    }
  }

  animate = () => {

    if (environment.isRenderCountLimited) {
      if (this.renderer.info.render.frame < 1800) {
        if (!this.showPopup) {
          requestAnimationFrame(this.animate);
          this.renderer.render(this.scene, this.camera);
        }
      }
    } else {
      if (!this.showPopup) {
        requestAnimationFrame(this.animate);
        this.renderer.render(this.scene, this.camera);
      }
    }
  };
}