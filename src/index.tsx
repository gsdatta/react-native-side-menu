import * as React from "react";
import {Animated, Dimensions, GestureResponderEvent, LayoutChangeEvent, PanResponder, PanResponderGestureState, PanResponderInstance, TouchableWithoutFeedback, View} from "react-native";
import {styles} from "./styles";

export interface Props {
    edgeHitWidth: number;
    toleranceX: number;
    toleranceY: number;
    menuPosition: "left" | "right";
    onChange: Function;
    onMove: Function;
    onSliding: Function;
    openMenuOffset: number;
    hiddenMenuOffset: number;
    disableGestures: () => boolean | boolean;
    animationFunction: Function;
    onAnimationComplete: Function;
    onStartShouldSetResponderCapture: Function;
    isOpen: boolean;
    bounceBackOnOverdraw: boolean;
    autoClosing: boolean;
    animationStyle: Function;
    menu?: React.ReactElement;
}

interface State {
    width: number;
    height: number;
    openOffsetMenuPercentage: number;
    openMenuOffset: number;
    hiddenMenuOffsetPercentage: number;
    hiddenMenuOffset: number;
    left: Animated.Value;
    leftValue: number;
}

const deviceScreen = Dimensions.get("window");
const barrierForward: number = deviceScreen.width / 4;

function shouldOpenMenu(dx: number): boolean {
    return dx > barrierForward;
}

export default class SideMenu extends React.Component<Props, State> {
    public onStartShouldSetPanResponderCapture: (e: GestureResponderEvent, gestureState: PanResponderGestureState) => boolean;
    public prevLeft: number;
    public isOpen: boolean;
    private sideMenu: SideMenu | null = null;
    private responder: PanResponderInstance;

    constructor(props: Props) {
        super(props);

        this.prevLeft = 0;
        this.isOpen = props.isOpen;

        const initialMenuPositionMultiplier = props.menuPosition === "right" ? -1 : 1;
        const openOffsetMenuPercentage = props.openMenuOffset / deviceScreen.width;
        const hiddenMenuOffsetPercentage = props.hiddenMenuOffset / deviceScreen.width;
        const left: Animated.Value = new Animated.Value(
            props.isOpen
                ? props.openMenuOffset * initialMenuPositionMultiplier
                : props.hiddenMenuOffset,
        );

        this.onLayoutChange = this.onLayoutChange.bind(this);
        this.onStartShouldSetPanResponderCapture = props.onStartShouldSetResponderCapture.bind(this);

        this.state = {
            width: deviceScreen.width,
            height: deviceScreen.height,
            openOffsetMenuPercentage,
            openMenuOffset: deviceScreen.width * openOffsetMenuPercentage,
            hiddenMenuOffsetPercentage,
            hiddenMenuOffset: deviceScreen.width * hiddenMenuOffsetPercentage,
            left,
            leftValue: 0,
        };

        this.state.left.addListener(({value}) => {
            this.props.onSliding(Math.abs((value - this.state.hiddenMenuOffset) / (this.state.openMenuOffset - this.state.hiddenMenuOffset)));
            this.setState({leftValue: value});
        });

        this.responder = PanResponder.create({
            onStartShouldSetPanResponderCapture: this.onStartShouldSetPanResponderCapture,
            onMoveShouldSetPanResponder: this.handleMoveShouldSetPanResponder,
            onPanResponderMove: this.handlePanResponderMove,
            onPanResponderRelease: this.handlePanResponderEnd,
            onPanResponderTerminate: this.handlePanResponderEnd,
        });

    }

    public onLayoutChange(e: LayoutChangeEvent) {
        const {width, height} = e.nativeEvent.layout;
        const openMenuOffset = width * this.state.openOffsetMenuPercentage;
        const hiddenMenuOffset = width * this.state.hiddenMenuOffsetPercentage;
        this.setState({width, height, openMenuOffset, hiddenMenuOffset});
    }

    /**
     * Get content view. This view will be rendered over menu
     * @return {React.Component}
     */
    getContentView = () => {
        let overlay: React.ReactElement | undefined;

        if (this.isOpen) {
            overlay = (
                <TouchableWithoutFeedback onPress={() => this.openMenu(false)}>
                    <View style={styles.overlay}/>
                </TouchableWithoutFeedback>
            );
        }

        const {width, height} = this.state;
        const ref = (sideMenu: SideMenu) => (this.sideMenu = sideMenu);
        const style = [
            styles.frontView,
            {width, height},
            this.props.animationStyle(this.state.left),
        ];

        return (
            <Animated.View style={style} ref={ref} {...this.responder.panHandlers}>
                {this.props.children}
                {overlay}
            </Animated.View>
        );
    };

    openMenu = (isOpen: boolean): void => {
        const {hiddenMenuOffset, openMenuOffset} = this.state;
        this.moveLeft(isOpen ? openMenuOffset : hiddenMenuOffset);
        this.isOpen = isOpen;

        this.forceUpdate();
        this.props.onChange(isOpen);
    };

    moveLeft = (offset: number) => {
        const newOffset = this.menuPositionMultiplier() * offset;

        this.props
            .animationFunction(this.state.left, newOffset)
            .start(this.props.onAnimationComplete);

        this.prevLeft = newOffset;
    };

    menuPositionMultiplier = (): -1 | 1 => this.props.menuPosition === "right" ? -1 : 1;

    handleMoveShouldSetPanResponder = (e: GestureResponderEvent, gestureState: PanResponderGestureState): boolean => {
        if (this.gesturesAreEnabled()) {
            const x = Math.round(Math.abs(gestureState.dx));
            const y = Math.round(Math.abs(gestureState.dy));

            const touchMoved = x > this.props.toleranceX && y < this.props.toleranceY;

            if (this.isOpen) {
                return touchMoved;
            }

            const withinEdgeHitWidth = this.props.menuPosition === "right" ?
                gestureState.moveX > (deviceScreen.width - this.props.edgeHitWidth) :
                gestureState.moveX < this.props.edgeHitWidth;

            const swipingToOpen = this.menuPositionMultiplier() * gestureState.dx > 0;
            return withinEdgeHitWidth && touchMoved && swipingToOpen;
        }

        return false;
    };

    handlePanResponderMove = (e: GestureResponderEvent, gestureState: PanResponderGestureState) => {
        if (this.state.leftValue * this.menuPositionMultiplier() >= 0) {
            let newLeft = this.prevLeft + gestureState.dx;

            if (!this.props.bounceBackOnOverdraw && Math.abs(newLeft) > this.state.openMenuOffset) {
                newLeft = this.menuPositionMultiplier() * this.state.openMenuOffset;
            }

            this.props.onMove(newLeft);
            this.state.left.setValue(newLeft);
        }
    };

    gesturesAreEnabled = (): boolean => {
        const {disableGestures} = this.props;

        if (typeof disableGestures === "function") {
            return !disableGestures();
        }

        return !disableGestures;
    };

    handlePanResponderEnd = (e: GestureResponderEvent, gestureState: PanResponderGestureState) => {
        const offsetLeft = this.menuPositionMultiplier() *
            (this.state.leftValue + gestureState.dx);

        this.openMenu(shouldOpenMenu(offsetLeft));
    };

    public render() {
        const boundaryStyle = this.props.menuPosition === "right" ?
            {left: this.state.width - this.state.openMenuOffset} :
            {right: this.state.width - this.state.openMenuOffset};

        const menu = (
            <View style={[styles.menu, boundaryStyle]}>
                {this.props.menu}
            </View>
        );

        return (
            <View
                style={styles.container}
                onLayout={this.onLayoutChange}
            >
                {menu}
                {this.getContentView()}
            </View>
        );
    }

}
