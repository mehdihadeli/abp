import {
  ComponentFactoryResolver,
  Directive,
  Injector,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  SimpleChanges,
  TemplateRef,
  Type,
  ViewContainerRef,
} from '@angular/core';
import { Store } from '@ngxs/store';
import { Subscription } from 'rxjs';
import { filter } from 'rxjs/operators';
import { ABP } from '../models/common';
import { ReplaceableComponents } from '../models/replaceable-components';
import { ReplaceableComponentsState } from '../states/replaceable-components.state';
import { takeUntilDestroy } from '../utils/rxjs-utils';
import compare from 'just-compare';
import snq from 'snq';

@Directive({ selector: '[abpReplaceableTemplate]' })
export class ReplaceableTemplateDirective implements OnInit, OnDestroy, OnChanges {
  private context = {};

  @Input('abpReplaceableTemplate')
  data: { inputs: any; outputs: any; componentKey: string };

  providedData = { inputs: {}, outputs: {} } as ReplaceableComponents.ReplaceableTemplateData<
    any,
    any
  >;

  externalComponent: Type<any>;

  defaultComponentRef: any;

  defaultComponentSubscriptions = {} as ABP.Dictionary<Subscription>;

  initialized = false;

  constructor(
    private injector: Injector,
    private templateRef: TemplateRef<any>,
    private cfRes: ComponentFactoryResolver,
    private vcRef: ViewContainerRef,
    private store: Store,
  ) {
    this.context = {
      initTemplate: ref => {
        Object.keys(this.defaultComponentSubscriptions).forEach(key => {
          this.defaultComponentSubscriptions[key].unsubscribe();
        });
        this.defaultComponentSubscriptions = {} as ABP.Dictionary<Subscription>;
        this.defaultComponentRef = ref;
        this.setDefaultComponentInputs();
      },
    };
  }

  ngOnInit() {
    this.store
      .select(ReplaceableComponentsState.getComponent(this.data.componentKey))
      .pipe(
        filter(
          (res = {} as ReplaceableComponents.ReplaceableComponent) =>
            !this.initialized || !compare(res.component, this.externalComponent),
        ),
        takeUntilDestroy(this),
      )
      .subscribe((res = {} as ReplaceableComponents.ReplaceableComponent) => {
        this.vcRef.clear();
        this.externalComponent = res.component;

        if (res.component) {
          this.setProvidedData();
          const customInjector = Injector.create({
            providers: [{ provide: 'REPLACEABLE_DATA', useValue: this.providedData }],
            parent: this.injector,
          });
          this.vcRef.createComponent(
            this.cfRes.resolveComponentFactory(res.component),
            0,
            customInjector,
          );
        } else {
          this.vcRef.createEmbeddedView(this.templateRef, this.context);
        }

        this.initialized = true;
      });
  }

  ngOnChanges(changes: SimpleChanges) {
    if (snq(() => changes.data.currentValue.inputs) && this.defaultComponentRef) {
      this.setDefaultComponentInputs();
    }
  }

  ngOnDestroy() {}

  setDefaultComponentInputs() {
    if (!this.defaultComponentRef || !this.data.inputs) return;

    for (const key in this.data.inputs) {
      if (this.data.inputs.hasOwnProperty(key)) {
        if (!compare(this.defaultComponentRef[key], this.data.inputs[key].value)) {
          this.defaultComponentRef[key] = this.data.inputs[key].value;

          if (this.data.inputs[key].twoWay && !this.defaultComponentSubscriptions[key]) {
            this.defaultComponentSubscriptions[key] = this.defaultComponentRef[
              `${key}Change`
            ].subscribe(value => {
              this.data.outputs[`${key}Change`](value);
            });
          }
        }
      }
    }
  }

  setProvidedData() {
    this.providedData = { ...this.data, inputs: {} };

    if (!this.providedData.inputs) return;
    Object.defineProperties(this.providedData.inputs, {
      ...Object.keys(this.data.inputs).reduce(
        (acc, key) => ({
          ...acc,
          [key]: {
            enumerable: true,
            configurable: true,
            get: () => this.data.inputs[key].value,
            ...(this.data.inputs[key].twoWay && {
              set: newValue => {
                this.data.inputs[key].value = newValue;
                this.data.outputs[`${key}Change`](newValue);
              },
            }),
          },
        }),
        {},
      ),
    });
  }
}