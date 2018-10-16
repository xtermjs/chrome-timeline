const TraceToTimelineModel = require('devtools-timeline-model');

module.exports['postProcess'] = (data) => {
  data = JSON.parse(data);
  const model = new TraceToTimelineModel(data.traceEvents);
  const timelineModel = model.timelineModel();
  const start = timelineModel._minimumRecordTime;
  const end = timelineModel._maximumRecordTime;
  return {
    metadata: data.metadata,
    summary: getSummary(timelineModel, start, end),
    topDown: getTreeData(model.topDown()),
    bottomUp: getTreeData(model.bottomUp())
  }
}

function getTreeData(tree) {
  const data = [];
  let uniqueId = 0;

  function walkTree(tree, parentId) {
    tree.children.forEach((value, key) => {
      const id = uniqueId++;
      data.push({id, parentId, name: value.id, selfTime: value.selfTime, totalTime: value.totalTime});
      if (value.children) {
        walkTree(value, id);
      }
    });
  }
  walkTree(tree, 0);
  return data;
}

function getSummary(model, startTime, endTime) {
  // closured for now

  /**
   * FIXME: cleanup this mess
   */

  let _aggregatedStatsKey = Symbol('aggregatedStats');

  function buildRangeStats(model, startTime, endTime) {
    var aggregatedStats = {};

    function compareEndTime(value, task) {
      return value < task.endTime() ? -1 : 1;
    }
    var mainThreadTasks = model.mainThreadTasks();
    var taskIndex = mainThreadTasks.lowerBound(startTime, compareEndTime);
    for (; taskIndex < mainThreadTasks.length; ++taskIndex) {
      var task = mainThreadTasks[taskIndex];
      if (task.startTime() > endTime)
        break;
      if (task.startTime() > startTime && task.endTime() < endTime) {
        // cache stats for top-level entries that fit the range entirely.
        var taskStats = task[_aggregatedStatsKey];
        if (!taskStats) {
          taskStats = {};
          _collectAggregatedStatsForRecord(task, startTime, endTime, taskStats);
          task[_aggregatedStatsKey] = taskStats;
        }
        for (var key in taskStats)
          aggregatedStats[key] = (aggregatedStats[key] || 0) + taskStats[key];
        continue;
      }
      _collectAggregatedStatsForRecord(task, startTime, endTime, aggregatedStats);
    }
    var aggregatedTotal = 0;
    for (var categoryName in aggregatedStats)
      aggregatedTotal += aggregatedStats[categoryName];
    aggregatedStats['idle'] = Math.max(0, endTime - startTime - aggregatedTotal);

    return aggregatedStats;
  }

  function _collectAggregatedStatsForRecord(record, startTime, endTime, aggregatedStats) {
    if (!record.endTime() || record.endTime() < startTime || record.startTime() > endTime)
      return;
    var childrenTime = 0;
    var children = record.children() || [];
    for (var i = 0; i < children.length; ++i) {
      var child = children[i];
      if (!child.endTime() || child.endTime() < startTime || child.startTime() > endTime)
        continue;
      childrenTime += Math.min(endTime, child.endTime()) - Math.max(startTime, child.startTime());
      _collectAggregatedStatsForRecord(child, startTime, endTime, aggregatedStats);
    }
    var categoryName = eventStyle(record.traceEvent()).category.name;
    var ownTime = Math.min(endTime, record.endTime()) - Math.max(startTime, record.startTime()) - childrenTime;
    aggregatedStats[categoryName] = (aggregatedStats[categoryName] || 0) + ownTime;
  }

  const TimelineCategory = class {
    constructor(name, title, visible, childColor, color) {
      this.name = name;
      this.title = title;
      this.visible = visible;
      this.childColor = childColor;
      this.color = color;
      this.hidden = false;
    }
  }

  const TimelineRecordStyle = class {
    constructor(title, category, hidden) {
      this.title = title;
      this.category = category;
      this.hidden = !!hidden;
    }
  };

  const Category = {
    Console: 'blink.console',
    UserTiming: 'blink.user_timing',
    LatencyInfo: 'latencyInfo'
  };

  const CATEGORIES = {
    loading: new TimelineCategory('loading', 'Loading', true, 'hsl(214, 67%, 74%)', 'hsl(214, 67%, 66%)'),
    scripting: new TimelineCategory('scripting', 'Scripting', true, 'hsl(43, 83%, 72%)', 'hsl(43, 83%, 64%) '),
    rendering: new TimelineCategory('rendering', 'Rendering', true, 'hsl(256, 67%, 76%)', 'hsl(256, 67%, 70%)'),
    painting: new TimelineCategory('painting', 'Painting', true, 'hsl(109, 33%, 64%)', 'hsl(109, 33%, 55%)'),
    gpu: new TimelineCategory('gpu', 'GPU', false, 'hsl(109, 33%, 64%)', 'hsl(109, 33%, 55%)'),
    other: new TimelineCategory('other', 'Other', false, 'hsl(0, 0%, 87%)', 'hsl(0, 0%, 79%)'),
    idle: new TimelineCategory('idle', 'Idle', false, 'hsl(0, 100%, 100%)', 'hsl(0, 100%, 100%)')
  };

  let EVENT_STYLES = {
    Task: new TimelineRecordStyle('Task', CATEGORIES['other']),
    Program: new TimelineRecordStyle('Other', CATEGORIES['other']),
    Animation: new TimelineRecordStyle('Animation', CATEGORIES['rendering']),
    EventDispatch: new TimelineRecordStyle('Event', CATEGORIES['scripting']),
    RequestMainThreadFrame: new TimelineRecordStyle('Request Main Thread Frame', CATEGORIES['rendering'], true),
    BeginFrame: new TimelineRecordStyle('Frame Start', CATEGORIES['rendering'], true),
    BeginMainThreadFrame: new TimelineRecordStyle('Frame Start (main thread)', CATEGORIES['rendering'], true),
    DrawFrame: new TimelineRecordStyle('Draw Frame', CATEGORIES['rendering'], true),
    HitTest: new TimelineRecordStyle('Hit Test', CATEGORIES['rendering']),
    ScheduleStyleRecalculation: new TimelineRecordStyle('Schedule Style Recalculation', CATEGORIES['rendering'], true),
    RecalculateStyles: new TimelineRecordStyle('Recalculate Style', CATEGORIES['rendering']),
    UpdateLayoutTree: new TimelineRecordStyle('Recalculate Style', CATEGORIES['rendering']),
    InvalidateLayout: new TimelineRecordStyle('Invalidate Layout', CATEGORIES['rendering'], true),
    Layout: new TimelineRecordStyle('Layout', CATEGORIES['rendering']),
    PaintSetup: new TimelineRecordStyle('Paint Setup', CATEGORIES['painting']),
    PaintImage: new TimelineRecordStyle('Paint Image', CATEGORIES['painting'], true),
    UpdateLayer: new TimelineRecordStyle('Update Layer', CATEGORIES['painting'], true),
    UpdateLayerTree: new TimelineRecordStyle('Update Layer Tree', CATEGORIES['rendering']),
    Paint: new TimelineRecordStyle('Paint', CATEGORIES['painting']),
    RasterTask: new TimelineRecordStyle('Rasterize Paint', CATEGORIES['painting']),
    ScrollLayer: new TimelineRecordStyle('Scroll', CATEGORIES['rendering']),
    CompositeLayers: new TimelineRecordStyle('Composite Layers', CATEGORIES['painting']),
    ParseHTML: new TimelineRecordStyle('Parse HTML', CATEGORIES['loading']),
    ParseAuthorStyleSheet: new TimelineRecordStyle('Parse Stylesheet', CATEGORIES['loading']),
    TimerInstall: new TimelineRecordStyle('Install Timer', CATEGORIES['scripting']),
    TimerRemove: new TimelineRecordStyle('Remove Timer', CATEGORIES['scripting']),
    TimerFire: new TimelineRecordStyle('Timer Fired', CATEGORIES['scripting']),
    XHRReadyStateChange: new TimelineRecordStyle('XHR Ready State Change', CATEGORIES['scripting']),
    XHRLoad: new TimelineRecordStyle('XHR Load', CATEGORIES['scripting']),
    ['v8.compile']: new TimelineRecordStyle('Compile Script', CATEGORIES['scripting']),
    EvaluateScript: new TimelineRecordStyle('Evaluate Script', CATEGORIES['scripting']),
    ['v8.parseOnBackground']: new TimelineRecordStyle('Parse Script', CATEGORIES['scripting']),
    MarkLoad: new TimelineRecordStyle('Load event', CATEGORIES['scripting'], true),
    MarkDOMContent: new TimelineRecordStyle('DOMContentLoaded event', CATEGORIES['scripting'], true),
    MarkFirstPaint: new TimelineRecordStyle('First paint', CATEGORIES['painting'], true),
    TimeStamp: new TimelineRecordStyle('Timestamp', CATEGORIES['scripting']),
    ConsoleTime: new TimelineRecordStyle('Console Time', CATEGORIES['scripting']),
    UserTiming: new TimelineRecordStyle('User Timing', CATEGORIES['scripting']),
    ResourceSendRequest: new TimelineRecordStyle('Send Request', CATEGORIES['loading']),
    ResourceReceiveResponse: new TimelineRecordStyle('Receive Response', CATEGORIES['loading']),
    ResourceFinish: new TimelineRecordStyle('Finish Loading', CATEGORIES['loading']),
    ResourceReceivedData: new TimelineRecordStyle('Receive Data', CATEGORIES['loading']),
    RunMicrotasks: new TimelineRecordStyle('Run Microtasks', CATEGORIES['scripting']),
    FunctionCall: new TimelineRecordStyle('Function Call', CATEGORIES['scripting']),
    GCEvent: new TimelineRecordStyle('GC Event', CATEGORIES['scripting']),
    MajorGC: new TimelineRecordStyle('Major GC', CATEGORIES['scripting']),
    MinorGC: new TimelineRecordStyle('Minor GC', CATEGORIES['scripting']),
    JSFrame: new TimelineRecordStyle('JS Frame', CATEGORIES['scripting']),
    RequestAnimationFrame: new TimelineRecordStyle('Request Animation Frame', CATEGORIES['scripting']),
    CancelAnimationFrame: new TimelineRecordStyle('Cancel Animation Frame', CATEGORIES['scripting']),
    FireAnimationFrame: new TimelineRecordStyle('Animation Frame Fired', CATEGORIES['scripting']),
    RequestIdleCallback: new TimelineRecordStyle('Request Idle Callback', CATEGORIES['scripting']),
    CancelIdleCallback: new TimelineRecordStyle('Cancel Idle Callback', CATEGORIES['scripting']),
    FireIdleCallback: new TimelineRecordStyle('Fire Idle Callback', CATEGORIES['scripting']),
    WebSocketCreate: new TimelineRecordStyle('Create WebSocket', CATEGORIES['scripting']),
    WebSocketSendHandshakeRequest: new TimelineRecordStyle('Send WebSocket Handshake', CATEGORIES['scripting']),
    WebSocketReceiveHandshakeResponse: new TimelineRecordStyle('Receive WebSocket Handshake', CATEGORIES['scripting']),
    WebSocketDestroy: new TimelineRecordStyle('Destroy WebSocket', CATEGORIES['scripting']),
    EmbedderCallback: new TimelineRecordStyle('Embedder Callback', CATEGORIES['scripting']),
    ['Decode Image']: new TimelineRecordStyle('Image Decode', CATEGORIES['painting']),
    ['Resize Image']: new TimelineRecordStyle('Image Resize', CATEGORIES['painting']),
    GPUTask: new TimelineRecordStyle('GPU', CATEGORIES['gpu']),
    LatencyInfo: new TimelineRecordStyle('Input Latency', CATEGORIES['scripting']),
    ['ThreadState::performIdleLazySweep']: new TimelineRecordStyle('DOM GC', CATEGORIES['scripting']),
    ['ThreadState::completeSweep']: new TimelineRecordStyle('DOM GC', CATEGORIES['scripting']),
    ['BlinkGCMarking']: new TimelineRecordStyle('DOM GC', CATEGORIES['scripting']),
  };

  function eventStyle(event) {
    if (event.hasCategory(Category.Console) || event.hasCategory(Category.UserTiming)) {
      return { title: event.name, category: CATEGORIES['scripting'] };
    }
    if (event.hasCategory(Category.LatencyInfo)) {
      var prefix = 'InputLatency::';
      var inputEventType = event.name.startsWith(prefix) ? event.name.substr(prefix.length) : event.name;
      var displayName = 'foo';
      // FIXME: fix inputEventDisplayName below
      //var displayName = Timeline.TimelineUIUtils.inputEventDisplayName(
      //    /** @type {!TimelineModel.TimelineIRModel.InputEvents} */ (inputEventType));
      return { title: displayName || inputEventType, category: CATEGORIES['scripting'] };
    }
    var result = EVENT_STYLES[event.name];
    if (!result) {
      result = new TimelineRecordStyle(event.name, CATEGORIES['other'], true);
      EVENT_STYLES[event.name] = result;
    }
    return result;
  }

  // FIXME - integrate above
  /*
  function inputEventDisplayName(inputEventType) {
    if (!Timeline.TimelineUIUtils._inputEventToDisplayName) {
      var inputEvent = TimelineModel.TimelineIRModel.InputEvents;
  
      Timeline.TimelineUIUtils._inputEventToDisplayName = new Map([
        [inputEvent.Char, 'Key Character'],
        [inputEvent.KeyDown, 'Key Down'],
        [inputEvent.KeyDownRaw, 'Key Down'],
        [inputEvent.KeyUp, 'Key Up'],
        [inputEvent.Click, 'Click'],
        [inputEvent.ContextMenu, 'Context Menu'],
        [inputEvent.MouseDown, 'Mouse Down'],
        [inputEvent.MouseMove, 'Mouse Move'],
        [inputEvent.MouseUp, 'Mouse Up'],
        [inputEvent.MouseWheel, 'Mouse Wheel'],
        [inputEvent.ScrollBegin, 'Scroll Begin'],
        [inputEvent.ScrollEnd, 'Scroll End'],
        [inputEvent.ScrollUpdate, 'Scroll Update'],
        [inputEvent.FlingStart, 'Fling Start'],
        [inputEvent.FlingCancel, 'Fling Halt'],
        [inputEvent.Tap, 'Tap'],
        [inputEvent.TapCancel, 'Tap Halt'],
        [inputEvent.ShowPress, 'Tap Begin'],
        [inputEvent.TapDown, 'Tap Down'],
        [inputEvent.TouchCancel, 'Touch Cancel'],
        [inputEvent.TouchEnd, 'Touch End'],
        [inputEvent.TouchMove, 'Touch Move'],
        [inputEvent.TouchStart, 'Touch Start'],
        [inputEvent.PinchBegin, 'Pinch Begin'],
        [inputEvent.PinchEnd, 'Pinch End'],
        [inputEvent.PinchUpdate, 'Pinch Update']
      ]);
    }
    return Timeline.TimelineUIUtils._inputEventToDisplayName.get(inputEventType) || null;
  }
  */

  return buildRangeStats(model, startTime, endTime);
}
