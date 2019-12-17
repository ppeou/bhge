/* highcharts-correction.js */
(function(_w) {
  var H = _w.Highcharts,
    PICK = H.pick,
    FIREEVENT = H.fireEvent,
    DEFINED = H.defined,
    COLOR = H.color;

  /**
   * Use last available event when updating non-snapped crosshairs without
   * mouse interaction (#5287)
   * */
  H.Axis.prototype.drawCrosshair = function (e, point) {
    var path, options = this.crosshair,
      snap = PICK(options.snap, true),
      pos, categorized, graphic = this.cross;
    FIREEVENT(this, 'drawCrosshair', {
      e: e,
      point: point
    });
    if (!e) {
      e = this.cross && this.cross.e;
    }
    if (
      // Disabled in options
      !this.crosshair ||
      // Snap
      ((DEFINED(point) || !snap) === false)) {
      this.hideCrosshair();
    } else {
      // Get the path
      if (!snap) {
        pos = e &&
          (this.horiz ?
            e.chartX - this.pos :
            this.len - e.chartY + this.pos);
      } else {
        if (DEFINED(point)) {
          // #3834
          pos = PICK(this.coll !== 'colorAxis' ?
            point.crosshairPos : // 3D axis extension
            null, this.isXAxis ?
            point.plotX :
            this.len - point.plotY);
        }
      }
      while (pos < 0) {
        pos += this.chart.chartWidth;
      }
      while (pos > this.chart.chartWidth) {
        pos -= this.chart.chartWidth;
      }
      if (DEFINED(pos)) {
        path = this.getPlotLinePath({
          // value, only used on radial
          value: point && (this.isXAxis ?
            point.x :
            PICK(point.stackY, point.y)),
          translatedValue: pos
        }) || null; // #3189
      }
      if (!DEFINED(path)) {
        this.hideCrosshair();
        return;
      }
      categorized = this.categories && !this.isRadial;
      // Draw the cross
      if (!graphic) {
        this.cross = graphic = this.chart.renderer
          .path()
          .addClass('highcharts-crosshair highcharts-crosshair-' +
            (categorized ? 'category ' : 'thin ') +
            options.className)
          .attr({
            zIndex: PICK(options.zIndex, 2)
          })
          .add();
        // Presentational attributes
        if (!this.chart.styledMode) {
          graphic.attr({
            stroke: options.color ||
              (categorized ?
                COLOR('#ccd6eb')
                  .setOpacity(0.25).get() :
                '#cccccc'),
            'stroke-width': PICK(options.width, 1)
          }).css({
            'pointer-events': 'none'
          });
          if (options.dashStyle) {
            graphic.attr({
              dashstyle: options.dashStyle
            });
          }
        }
      }
      graphic.show().attr({
        d: path
      });
      if (categorized && !options.width) {
        graphic.attr({
          'stroke-width': this.transA
        });
      }
      this.cross.e = e;
    }
    FIREEVENT(this, 'afterDrawCrosshair', {
      e: e,
      point: point
    });
  };

  /**
   * Override the reset function, we don't need to hide the tooltips and
   * crosshairs.
   * */
  H.Pointer.prototype.reset = function () {
    return undefined;
  };

  /**
   * Highlight a point by showing tooltip, setting hover state and draw crosshair
   * */
  H.Point.prototype.highlight = function (event) {
    event = this.series.chart.pointer.normalize(event);
    this.onMouseOver(); // Show the hover marker
    // commented the below line due to cause null pointer execption on UI
    //this.series.chart.tooltip.refresh(this); // Show the tooltip
    this.series.chart.xAxis[0].drawCrosshair(event, this); // Show the crosshair
  };

  /**
   * Synchronize zooming through the setExtremes event handler.
   * */
  function syncExtremes(e) {
    var thisChart = this.chart;

    if (e.trigger !== 'syncExtremes') { // Prevent feedback loop
      H.each(H.charts, function (chart) {
        if (chart !== thisChart) {
          if (chart.xAxis[0].setExtremes) { // It is null while updating
            chart.xAxis[0].setExtremes(
              e.min,
              e.max,
              undefined,
              false,
              { trigger: 'syncExtremes' }
            );
          }
        }
      });
    }
  }

  _w.HighchartsOverridesyncExtremes = syncExtremes;

})(window);

/* highcharts-synchronizer.js */
(function(_w) {
  var H = _w.Highcharts;


  /**
   * To enable synchronization of multiple charts in a given attached-DOM.
   * Each chart can be linked through DOM and Highcharts events and API methods
   *
   * * @param {object} attachedDome - an DOM that HighCharts resided
   *
   * @example
   *
   *    enableSynchronizedCharts(myHighChartArea)
   * */

  function getParent(chart) {
    return chart ? chart.renderTo.parentElement.parentElement.parentElement.parentElement.parentElement.parentElement.parentElement.parentElement.parentElement.parentElement.parentElement.parentElement.parentElement.parentElement.parentElement.parentElement.parentElement.parentElement : null;
  }

  function getOffset(chart) {
    return (chart.renderTo || chart).offsetParent.offsetParent.offsetParent.offsetParent.offsetLeft;
  }

  function enableSynchronizedCharts(attachedDom) {
    var mappedCharts = {};
    window.mappedCharts = mappedCharts;
    var toSyncEvents = ['mousemove', 'touchmove', 'touchstart'];

    H.charts.forEach(function (chart) {
      if(chart) {
        var parent = getParent(chart);
        console.log('## attachedDom', chart.renderTo.id, attachedDom)
        console.log('##', parent === attachedDom);
        if (parent === attachedDom) {
          var dom = chart.renderTo;
          if(dom.id.indexOf('chart') === 0) {
            mappedCharts[dom.id] = chart;
          }
        }
      }
    });

    Object.keys(mappedCharts).forEach(function (chartId) {
      toSyncEvents.forEach(function (eventType) {
        mappedCharts[chartId].renderTo.addEventListener(eventType, function (e) {
          highlightPoints(mappedCharts, e);
        });
      });
    });


  };

  function highlightPoints(mappedCharts, e) {
    var dom = e.currentTarget;
    var currentOffsetLeft = getOffset(dom);
    Object.keys(mappedCharts).forEach(function (chartId, idx) {
      var chart = mappedCharts[chartId];
      var dom = chart.renderTo;
      var event = chart.pointer.normalize(e);
      var correctionChartX = event.chartX - (currentOffsetLeft - getOffset(dom));
      var _event =
        {
          ...event,
          chartX: correctionChartX,
        };
      var point = chart.series[0].searchPoint(_event, true);
      if (point && point.series.visible) {
        point.highlight(e);
      }
    });
  }

  _w.enableSynchronizedCharts = enableSynchronizedCharts;

})(window);

/* interpolation.js */
(function () {
  /**
   * To get all visible series from a chart
   * @param {series[]} series - array highcharts series
   * @param {boolean} skipFirstSeries - indicator to return only visible series
   *
   * @example
   *
   *    getVisibleSeries([series1, series2], true)
   *    return [series1, series2];
   * */
  function getVisibleSeries(series, onlyShowVisible) {
    var items = [];
    if(onlyShowVisible) {
      series.forEach(function (s) {
        if (s.visible) {
          items.push(s);
        }
      });
    }
    else {
      items = series;
    }
    return items;
  }

  /**
   * To get all visible points
   * @param {point[]} point - array highcharts points of an event
   * @param {boolean} skipFirstSeries - indicator to show point from visible series
   *
   * @example
   *
   *    getVisibleSeries([point1, point2], true)
   *    return {'series-1-name': 1, 'series-2-name': 2};
   * */
  function getVisiblePoint(points, onlyShowVisible) {
    var items = {};
    if(onlyShowVisible) {
      points.forEach(function (p) {
        if (p.series.visible) {
          items[p.series.name] = p.y;
          p.series.setState('hover');
        }
      });
    } else {
      points.forEach(function (p) {
        items[p.series.name] = p.y;
      });
    }
    return items;
  }

  /**
   * To provide actual value or interpolated values for all visible series in a chart
   *
   * @param {xVal} - value of x
   * @param {yVal} - value of y
   * @param {Point[]} - array of Highcharts.Point that associate with hover event
   * @return {Object[]} - array of {name: 'series-name', value: yValue}
   *
   * @example
   *
   *    getTnterpolatedValue(1, 2, {points})
   *    return {'serie-1-name': yValue, 'serie-2-name': yValue}
   * */
  function getTnterpolatedValue(xVal, points, onlyShowVisible, skipFirstDummySeries) {
    var series = points[0].series.chart.series;
    series = skipFirstDummySeries ? series.slice(1) : series;
    var _series = getVisibleSeries(series, onlyShowVisible);
    var _points = getVisiblePoint((skipFirstDummySeries ? points.slice(1) : points), onlyShowVisible);

    var hasDataSeriesNames = {};
    var hasNoDataSeries = [];
    points.forEach(function (p) {
      if (p.series.visible) {
        hasDataSeriesNames[p.series.name] = p.y;
      }
    });

    _series.forEach(function (s) {
      if (!_points.hasOwnProperty(s.name)) {
        _points[s.name] = interpolateSeries(xVal, s);
      }
    });
    var items = [];
    _series.forEach(function (s) {
      if(_points.hasOwnProperty(s.name)) {
        items.push({name: s.name, value: _points[s.name]})
      }
    });
    return items;
  };

  /**
   * To provide interpolated value for Y based on X value
   *
   * @param {xVal} - value of x
   * @param {Series[]} - series of Highcharts
   * @return {number} - value of y
   *
   * @example
   *
   *    getTnterpolatedValue(1, series)
   *    return 3;
   * */
  function interpolateSeries(xVal, series) {
    var numPoints = series.points.length;
    var i = numPoints;
    var pointLess;
    var pointMore;
    var interpolated = true;
    var yVal;

    if (interpolated) {
      // We need to interpolate. Find a point with smaller and one with greater X value.
      while (i--) {
        if (!series.points[i].isNull && series.points[i].x < xVal) {
          pointLess = series.points[i];
          break;
        }
      }
      for (i = 0; i < numPoints; ++i) {
        if (!series.points[i].isNull && series.points[i].x > xVal) {
          pointMore = series.points[i];
          break;
        }
      }

      if (!pointLess || !pointMore) {
        // For ends, don't interpolate
        yVal = "-";
      } else {
        yVal = pointLess.y + (pointMore.y - pointLess.y) / (pointMore.x - pointLess.x) * (xVal - pointLess.x);
      }
    }

    return (yVal === '-' ? 'null' : yVal) + ' (int)';
  }

  window.getTnterpolatedValue = getTnterpolatedValue;

})();
