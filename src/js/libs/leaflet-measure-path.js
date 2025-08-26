/*
 * Copyright (c) 2016, Per Liedman (per@liedman.net)
 * https://github.com/ProminentEdge/leaflet-measure-path
 * Heavily patched/edited by Maxime "sharkman" Boussard for squadcalc
 * https://github.com/sh4rkman/SquadCalc
 */

//import L from "leaflet";
import i18next from "i18next";
import { Marker, Polyline, Polygon, LayerGroup, Util, Layer, DomUtil, Circle } from "leaflet";

(function() {
    "use strict";

    Marker.Measurement = Layer.extend({
        options: {
            pane: "markerPane"
        },

        initialize: function(latlng, measurement, title, rotation, options) {
            Util.setOptions(this, options);
            this._latlng = latlng;
            this._measurement = measurement;
            this._title = title;
            this._rotation = rotation;
        },

        addTo: function(map) {
            map.addLayer(this);
            return this;
        },

        onAdd: function(map) {
            this._map = map;
            let pane = this.getPane ? this.getPane() : map.getPanes().markerPane;
            let el = this._element = DomUtil.create("div", "leaflet-zoom-animated leaflet-measure-path-measurement", pane);
            let inner = DomUtil.create("div", "", el);
            inner.title = this._title;
            inner.innerHTML = this._measurement;

            map.on("zoomanim", this._animateZoom, this);

            this._setPosition();
        },

        onRemove: function(map) {
            map.off("zoomanim", this._animateZoom, this);
            let pane = this.getPane ? this.getPane() : map.getPanes().markerPane;
            pane.removeChild(this._element);
            this._map = null;
        },

        _setPosition: function() {
            DomUtil.setPosition(this._element, this._map.latLngToLayerPoint(this._latlng));
            this._element.style.transform += " rotate(" + this._rotation + "rad)";
        },

        _animateZoom: function(opt) {
            var pos = this._map._latLngToNewLayerPoint(this._latlng, opt.zoom, opt.center).round();
            DomUtil.setPosition(this._element, pos);
            this._element.style.transform += " rotate(" + this._rotation + "rad)";
        }
    });

    Marker.measurement = function(latLng, measurement, title, rotation, options) {
        return new Marker.Measurement(latLng, measurement, title, rotation, options);
    };

    let formatDistance = function(d) {
        let unit,
            feet;

        if (this._measurementOptions.imperial) {
            feet = d / 0.3048;
            if (feet > 3000) {
                d = d / 1609.344;
                unit = "mi";
            } else {
                d = feet;
                unit = "ft";
            }
        } else {
            if (d > 1000) {
                d = d / 1000;
                unit = i18next.t("common:km");
            } else {
                unit = i18next.t("common:m");
            }
        }

        if (d < 100) {
            return d.toFixed(1) + unit;
        } else {
            return Math.round(d) + unit;
        }
    };

    let formatArea = function(a) {
        let unit;

        if (this._measurementOptions.imperial) {
            if (a > 404.685642) {
                a = a / 4046.85642;
                unit = "ac";
            } else {
                a = a / 0.09290304;
                unit = "ft²";
            }
        } else if (this._measurementOptions.ha) {
            if (a > 1000000000) {
                a = a / 1000000000;
                unit = "km²";
            } else if (a > 10000) {
                a = a / 10000;
                unit = "ha";
            } else {
                unit = "m²";
            }
        } else {
            if (a > 1000000) {
                a = a / 1000000;
                unit = "km²";
            } else {
                unit = "m²";
            }
        }

        if (a < 100) {
            return a.toFixed(1) + " " + unit;
        } else {
            return Math.round(a) + " " + unit;
        }
    };

    let RADIUS = 6378137;
    // ringArea function copied from geojson-area
    // (https://github.com/mapbox/geojson-area)
    // This function is distributed under a separate license,
    // see LICENSE.md.
    let ringArea = function ringArea(coords) {
        var rad = function rad(_) {
            return _ * Math.PI / 180;
        };
        var p1, p2, p3, lowerIndex, middleIndex, upperIndex,
            area = 0,
            coordsLength = coords.length;

        if (coordsLength > 2) {
            for (let i = 0; i < coordsLength; i++) {
                if (i === coordsLength - 2) {// i = N-2
                    lowerIndex = coordsLength - 2;
                    middleIndex = coordsLength -1;
                    upperIndex = 0;
                } else if (i === coordsLength - 1) {// i = N-1
                    lowerIndex = coordsLength - 1;
                    middleIndex = 0;
                    upperIndex = 1;
                } else { // i = 0 to N-3
                    lowerIndex = i;
                    middleIndex = i+1;
                    upperIndex = i+2;
                }
                p1 = coords[lowerIndex];
                p2 = coords[middleIndex];
                p3 = coords[upperIndex];
                area += ( rad(p3.lng) - rad(p1.lng) ) * Math.sin( rad(p2.lat));
            }

            area = area * RADIUS * RADIUS / 2;
        }

        return Math.abs(area);
    };
    /**
     * Handles the init hook for polylines and circles.
     * Implements the showOnHover functionality if called for.
     */
    let addInitHook = function() {
        var showOnHover = this.options.measurementOptions && this.options.measurementOptions.showOnHover;
        if (this.options.showMeasurements && !showOnHover) {
            this.showMeasurements();
        }
        if (this.options.showMeasurements && showOnHover) {
            this.on("pointerover", function() {
                this.showMeasurements(this.options.measurementOptions);
            });
            this.on("pointerout", function() {
                this.hideMeasurements();
            });
        }
    };

    let circleArea = function circleArea(d) {
        let rho = d / RADIUS;
        return 2 * Math.PI * RADIUS * RADIUS * (1 - Math.cos(rho));
    };

    let override = function(method, fn, hookAfter) {
        if (!hookAfter) {
            return function() {
                let originalReturnValue = method.apply(this, arguments);
                let args = Array.prototype.slice.call(arguments);
                args.push(originalReturnValue);
                return fn.apply(this, args);
            };
        } else {
            return function() {
                fn.apply(this, arguments);
                return method.apply(this, arguments);
            };
        }
    };

    Polyline.include({
        showMeasurements: function(options) {
            if (!this._map || this._measurementLayer) return this;

            this._measurementOptions = Object.assign({
                showOnHover: (options && options.showOnHover) || false,
                minPixelDistance: 30,
                showDistances: true,
                showArea: true,
                showTotalDistance: options.showTotalDistance,
                scaling: options.scaling || 1,
                lang: {
                    totalLength: "Total length",
                    totalArea: "Total area",
                    segmentLength: "Segment length"
                }
            }, options || {});

            this._measurementLayer = new LayerGroup().addTo(this._map);
            this.updateMeasurements();
            this._map.on("zoom", this.updateMeasurements, this);
            return this;
        },

        hideMeasurements: function() {
            if (!this._map) return this;

            this._map.off("zoom", this.updateMeasurements, this);

            if (!this._measurementLayer) return this;
            this._map.removeLayer(this._measurementLayer);
            this._measurementLayer = null;
            return this;
        },

        onAdd: override(Polyline.prototype.onAdd, function(originalReturnValue) {
            var showOnHover = this.options.measurementOptions && this.options.measurementOptions.showOnHover;
            if (this.options.showMeasurements && !showOnHover) {
                this.showMeasurements(this.options.measurementOptions);
            }
            return originalReturnValue;
        }),

        onRemove: override(Polyline.prototype.onRemove, function(originalReturnValue) {
            this.hideMeasurements();
            return originalReturnValue;
        }, true),

        setLatLngs: override(Polyline.prototype.setLatLngs, function(originalReturnValue) {
            this.updateMeasurements();
            return originalReturnValue;
        }),

        spliceLatLngs: override(Polyline.prototype.spliceLatLngs, function(originalReturnValue) {
            this.updateMeasurements();
            return originalReturnValue;
        }),

        formatDistance: formatDistance,
        formatArea: formatArea,

        updateMeasurements: function() {
            if (!this._measurementLayer) return this;

            let latLngs = this.getLatLngs(),
                isPolygon = this instanceof Polygon,
                options = this._measurementOptions,
                totalDist = 0,
                formatter,
                ll1,
                ll2,
                p1,
                p2,
                pixelDist,
                dist;

            if (latLngs && latLngs.length && Array.isArray(latLngs[0])) {
                // Outer ring is stored as an array in the first element,
                // use that instead.
                latLngs = latLngs[0];
            }

            this._measurementLayer.clearLayers();

            if (this._measurementOptions.showDistances && latLngs.length > 1) {
                formatter = this._measurementOptions.formatDistance || this.formatDistance.bind(this);

                for (let i = 1, len = latLngs.length; (isPolygon && i <= len) || i < len; i++) {
                    ll1 = latLngs[i - 1];
                    ll2 = latLngs[i % len];
                    dist = ll1.distanceTo(ll2);

                    totalDist += dist;

                    p1 = this._map.latLngToLayerPoint(ll1);
                    p2 = this._map.latLngToLayerPoint(ll2);

                    let p3 = this._map.project(ll1, 0);
                    let p4 = this._map.project(ll2, 0);
                    let distMap = Math.sqrt(Math.pow(p4.x - p3.x, 2) + Math.pow(p4.y - p3.y, 2));
                    distMap = distMap * this._measurementOptions.scaling; 

                    pixelDist = p1.distanceTo(p2);

                    if (pixelDist >= options.minPixelDistance) {
                        Marker.measurement(
                            this._map.layerPointToLatLng([(p1.x + p2.x) / 2, (p1.y + p2.y) / 2]),
                            formatter(distMap), options.lang.segmentLength, this._getRotation(ll1, ll2), options)
                            .addTo(this._measurementLayer);
                    }
                }

                // Show total length for polylines
                if (!isPolygon && this._measurementOptions.showTotalDistance) {
                    Marker.measurement(ll2, formatter(totalDist), options.lang.totalLength, 0, options)
                        .addTo(this._measurementLayer);
                }
            }

            if (isPolygon && options.showArea && latLngs.length > 2) {
                formatter = options.formatArea || this.formatArea.bind(this);
                let area = ringArea(latLngs);
                Marker.measurement(this.getBounds().getCenter(),
                    formatter(area), options.lang.totalArea, 0, options)
                    .addTo(this._measurementLayer);
            }

            return this;
        },

        _getRotation: function(ll1, ll2) {
            let p1 = this._map.project(ll1),
                p2 = this._map.project(ll2);
            return Math.atan((p2.y - p1.y) / (p2.x - p1.x));
        }
    });

    Polyline.addInitHook(function() {
        addInitHook.call(this);
    });

    Circle.include({
        showMeasurements: function(options) {
            if (!this._map || this._measurementLayer) return this;

            this._measurementOptions = Object.assign({
                showOnHover: false,
                showArea: true,
                scaling: options.scaling || 1,
                lang: {
                    totalArea: "Total area",
                }
            }, options || {});

            this._measurementLayer = new LayerGroup().addTo(this._map);
            this.updateMeasurements();
            this._map.on("zoom", this.updateMeasurements, this);
            return this;
        },

        hideMeasurements: function() {
            if (!this._map) return this;
            this._map.on("zoom", this.updateMeasurements, this);
            if (!this._measurementLayer) return this;
            this._map.removeLayer(this._measurementLayer);
            this._measurementLayer = null;
            return this;
        },

        onAdd: override(Circle.prototype.onAdd, function(originalReturnValue) {
            var showOnHover = this.options.measurementOptions && this.options.measurementOptions.showOnHover;
            if (this.options.showMeasurements && !showOnHover) {
                this.showMeasurements(this.options.measurementOptions);
            }
            return originalReturnValue;
        }),

        onRemove: override(Circle.prototype.onRemove, function(originalReturnValue) {
            this.hideMeasurements();
            return originalReturnValue;
        }, true),

        setLatLng: override(Circle.prototype.setLatLng, function(originalReturnValue) {
            this.updateMeasurements();
            return originalReturnValue;
        }),

        setRadius: override(Circle.prototype.setRadius, function(originalReturnValue) {
            this.updateMeasurements();
            return originalReturnValue;
        }),

        formatArea: formatArea,

        updateMeasurements: function() {
            if (!this._measurementLayer) return;

            let latLng = this.getLatLng(),
                options = this._measurementOptions,
                formatter = options.formatArea || this.formatArea.bind(this);


            this._measurementLayer.clearLayers();

            if (options.showArea) {
                formatter = options.formatArea || this.formatArea.bind(this);
                let area = circleArea(this.getRadius());
                Marker.measurement(latLng,
                    formatter(area), options.lang.totalArea, 0, options)
                    .addTo(this._measurementLayer);
            }
        }
    });

    Circle.addInitHook(function() {
        addInitHook.call(this);
    });
})();